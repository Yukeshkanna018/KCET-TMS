import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { students } from './src/data/students';
import { generateSchedule } from './src/utils/scheduler';
import { generateScheduleLogic } from './src/utils/scheduler-backend';

const db = new Database('toastmasters.db');

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    roll_no TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS days (
    date TEXT PRIMARY KEY, -- Format: DD.MM.YYYY
    day_name TEXT NOT NULL,
    theme TEXT
  );
  
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    role TEXT NOT NULL,
    student_roll_no TEXT NOT NULL,
    FOREIGN KEY(date) REFERENCES days(date),
    FOREIGN KEY(student_roll_no) REFERENCES students(roll_no)
  );
`);

// Seed students if empty
try {
  const stmt = db.prepare('SELECT count(*) as count FROM students');
  const count = stmt.get() as { count: number };
  if (count.count === 0) {
    const insert = db.prepare('INSERT INTO students (roll_no, name) VALUES (?, ?)');
    const insertMany = db.transaction((students) => {
      for (const s of students) insert.run(s.rollNo, s.name);
    });
    insertMany(students);
    console.log('Seeded students database');
  }
} catch (e) {
  console.error('Error seeding students:', e);
}

// Seed initial schedule if empty
try {
  const daysCount = db.prepare('SELECT count(*) as count FROM days').get() as { count: number };
  if (daysCount.count === 0) {
    console.log('Seeding initial schedule...');
    const initialSchedule = generateSchedule();
    
    const insertDay = db.prepare('INSERT INTO days (date, day_name) VALUES (?, ?)');
    const insertAssignment = db.prepare('INSERT INTO assignments (date, role, student_roll_no) VALUES (?, ?, ?)');

    const transaction = db.transaction(() => {
      for (const entry of initialSchedule) {
        // Check if day exists first (just in case generateSchedule has duplicates or overlaps)
        const dayExists = db.prepare('SELECT 1 FROM days WHERE date = ?').get(entry.date);
        if (!dayExists) {
            insertDay.run(entry.date, entry.day);
        }
        for (const role of entry.roles) {
          insertAssignment.run(entry.date, role.role, role.student.rollNo);
        }
      }
    });
    
    transaction();
    console.log('Seeded initial schedule');
  }
} catch (e) {
  console.error('Error seeding schedule:', e);
}

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes

// Login (Simple password check)
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === 'admin123') {
    res.json({ success: true, token: 'admin-token' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// Get Schedule
app.get('/api/schedule', (req, res) => {
  try {
    const days = db.prepare('SELECT * FROM days').all() as any[];
    const assignments = db.prepare(`
      SELECT a.*, s.name as student_name 
      FROM assignments a 
      JOIN students s ON a.student_roll_no = s.roll_no
    `).all() as any[];

    // Group by day
    const schedule = days.map(day => {
      const dayAssignments = assignments.filter(a => a.date === day.date);
      return {
        date: day.date,
        day: day.day_name,
        theme: day.theme,
        roles: dayAssignments.map(a => ({
          id: a.id,
          role: a.role,
          student: {
            rollNo: a.student_roll_no,
            name: a.student_name
          }
        }))
      };
    });
    
    // Sort schedule by date (DD.MM.YYYY)
    schedule.sort((a, b) => {
      const [d1, m1, y1] = a.date.split('.').map(Number);
      const [d2, m2, y2] = b.date.split('.').map(Number);
      return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
    });

    res.json(schedule);
  } catch (e) {
    console.error('Error fetching schedule:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update Theme
app.put('/api/day/:date/theme', (req, res) => {
  const { date } = req.params;
  const { theme } = req.body;
  db.prepare('UPDATE days SET theme = ? WHERE date = ?').run(theme, date);
  res.json({ success: true });
});

// Update Assignment (Change Student)
app.put('/api/assignment/:id', (req, res) => {
  const { id } = req.params;
  const { rollNo } = req.body;
  db.prepare('UPDATE assignments SET student_roll_no = ? WHERE id = ?').run(rollNo, id);
  res.json({ success: true });
});

// Generate Schedule (Admin)
app.post('/api/generate', (req, res) => {
  const { days } = req.body; // Array of { date, day }
  
  const existingDates = new Set(db.prepare('SELECT date FROM days').all().map((d: any) => d.date));
  const newDays = days.filter((d: any) => !existingDates.has(d.date));
  
  if (newDays.length === 0) {
    return res.json({ message: "No new days to generate." });
  }

  const allStudents = db.prepare('SELECT * FROM students').all() as any[];
  
  const historyRows = db.prepare('SELECT student_roll_no, role FROM assignments').all() as any[];
  const history: Record<string, Set<string>> = {};
  allStudents.forEach(s => history[s.roll_no] = new Set());
  historyRows.forEach(r => {
    if (history[r.student_roll_no]) {
      history[r.student_roll_no].add(r.role);
    }
  });

  const generated = generateScheduleLogic(newDays, allStudents, history);

  const insertDay = db.prepare('INSERT INTO days (date, day_name) VALUES (?, ?)');
  const insertAssignment = db.prepare('INSERT INTO assignments (date, role, student_roll_no) VALUES (?, ?, ?)');

  const transaction = db.transaction(() => {
    for (const entry of generated) {
      insertDay.run(entry.date, entry.day);
      for (const role of entry.roles) {
        insertAssignment.run(entry.date, role.role, role.student.rollNo);
      }
    }
  });

  transaction();
  
  res.json({ success: true });
});

// Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
