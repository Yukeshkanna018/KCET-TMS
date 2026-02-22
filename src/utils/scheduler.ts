import { Student, students } from '../data/students';

export interface ScheduleEntry {
  date: string;
  day: string;
  roles: { role: string; student: Student }[];
}

const ROLES = [
  "TMOD",
  "GE",
  "TTM",
  "Timer",
  "Ah Counter",
  "Grammarian",
  "Speaker 1",
  "Speaker 2",
  "Speaker 3",
  "Evaluator 1",
  "Evaluator 2",
  "Evaluator 3",
  "TT Speaker 1",
  "TT Speaker 2",
  "TT Speaker 3"
];

const WORKING_DAYS = [
  { date: "02.03.2026", day: "Monday" },
  { date: "03.03.2026", day: "Tuesday" },
  { date: "04.03.2026", day: "Wednesday" },
  { date: "05.03.2026", day: "Thursday" },
  { date: "06.03.2026", day: "Friday" },
  { date: "09.03.2026", day: "Monday" },
  { date: "10.03.2026", day: "Tuesday" },
  { date: "11.03.2026", day: "Wednesday" },
  // 12-18 Exams
  // 19-22 Holidays
  { date: "23.03.2026", day: "Monday" },
  { date: "24.03.2026", day: "Tuesday" },
  { date: "25.03.2026", day: "Wednesday" },
  { date: "26.03.2026", day: "Thursday" },
  { date: "27.03.2026", day: "Friday" },
  // 28 Funtura, 29 Sun
  { date: "30.03.2026", day: "Monday" },
  { date: "31.03.2026", day: "Tuesday" }
];

export function generateSchedule(): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  const studentRoleHistory: Record<string, Set<string>> = {};

  // Initialize history
  students.forEach(s => {
    studentRoleHistory[s.rollNo] = new Set();
  });

  // Sort students by Roll No to ensure sequential order
  const sortedStudents = [...students].sort((a, b) => a.rollNo.localeCompare(b.rollNo));
  
  let currentStudentIndex = 0;

  for (const dayInfo of WORKING_DAYS) {
    const dayRoles: { role: string; student: Student }[] = [];
    const studentsUsedToday = new Set<string>();

    // 1. Select the group of 15 students for today - SEQUENTIAL
    const dayStudents: Student[] = [];
    for (let i = 0; i < 15; i++) {
        dayStudents.push(sortedStudents[currentStudentIndex]);
        currentStudentIndex = (currentStudentIndex + 1) % sortedStudents.length;
    }

    // 2. Assign Roles within this group of 15
    // We have 15 roles and 15 students.
    // Strategy:
    // - Separate Main Roles (12) and TT Roles (3)
    // - Shuffle the group of 15 to randomly assign who gets Main vs TT within this group?
    //   OR
    // - Try to respect history for Main Roles.
    
    const studentsForDay = [...dayStudents];
    const assignedInGroup = new Set<string>();
    
    // A. Assign Main Roles (12)
    const mainRoles = ROLES.slice(0, 12);
    
    for (const role of mainRoles) {
        // Find best candidate among the 15 who hasn't been assigned a role today
        // and preferably hasn't done this role before.
        let candidates = studentsForDay.filter(s => !assignedInGroup.has(s.rollNo));
        
        // Filter by history if possible
        let historyCandidates = candidates.filter(s => !studentRoleHistory[s.rollNo].has(role));
        
        let selected: Student;
        
        if (historyCandidates.length > 0) {
            // Pick random from valid history candidates to avoid bias
            selected = historyCandidates[Math.floor(Math.random() * historyCandidates.length)];
        } else {
            // Must repeat a role (unlikely in first month, but possible later)
            selected = candidates[Math.floor(Math.random() * candidates.length)];
        }

        if (selected) {
            dayRoles.push({ role, student: selected });
            assignedInGroup.add(selected.rollNo);
            studentRoleHistory[selected.rollNo].add(role);
        }
    }

    // B. Assign TT Speakers (3) - The remaining 3 students
    const ttRoles = ROLES.slice(12);
    const remainingForTT = studentsForDay.filter(s => !assignedInGroup.has(s.rollNo));
    
    for (let i = 0; i < ttRoles.length; i++) {
        const role = ttRoles[i];
        const selected = remainingForTT[i]; // Just take them, they are the leftovers
        
        if (selected) {
            dayRoles.push({ role, student: selected });
            assignedInGroup.add(selected.rollNo);
            studentRoleHistory[selected.rollNo].add(role);
        }
    }

    schedule.push({
      date: dayInfo.date,
      day: dayInfo.day,
      roles: dayRoles
    });
  }

  return schedule;
}
