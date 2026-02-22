import { Student } from '../data/students';

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

export function generateScheduleLogic(
  workingDays: { date: string; day: string }[], 
  students: Student[],
  existingHistory: Record<string, Set<string>>
): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  const studentRoleHistory = { ...existingHistory };

  // Sort students by Roll No to ensure sequential order
  const sortedStudents = [...students].sort((a, b) => a.rollNo.localeCompare(b.rollNo));
  
  // We need to maintain the "current student index" across generations if possible.
  // For now, we'll start from 0 for every batch generation or try to infer it?
  // Inferring is hard without persistent state of "last used index".
  // Let's just randomize the start index to avoid always starting with the first student
  // if we generate month by month.
  // OR, better: Calculate total assignments so far to find offset?
  // Let's just start at 0 for now, or maybe random. 
  // Random start index is safer for fairness across months if state isn't perfectly tracked.
  let currentStudentIndex = Math.floor(Math.random() * sortedStudents.length);

  for (const dayInfo of workingDays) {
    const dayRoles: { role: string; student: Student }[] = [];
    const studentsUsedToday = new Set<string>();

    // 1. Select the group of 15 students for today - SEQUENTIAL
    const dayStudents: Student[] = [];
    for (let i = 0; i < 15; i++) {
        dayStudents.push(sortedStudents[currentStudentIndex]);
        currentStudentIndex = (currentStudentIndex + 1) % sortedStudents.length;
    }

    const studentsForDay = [...dayStudents];
    const assignedInGroup = new Set<string>();
    
    // A. Assign Main Roles (12)
    const mainRoles = ROLES.slice(0, 12);
    
    for (const role of mainRoles) {
        let candidates = studentsForDay.filter(s => !assignedInGroup.has(s.rollNo));
        let historyCandidates = candidates.filter(s => !studentRoleHistory[s.rollNo].has(role));
        
        let selected: Student;
        
        if (historyCandidates.length > 0) {
            selected = historyCandidates[Math.floor(Math.random() * historyCandidates.length)];
        } else {
            selected = candidates[Math.floor(Math.random() * candidates.length)];
        }

        if (selected) {
            dayRoles.push({ role, student: selected });
            assignedInGroup.add(selected.rollNo);
            studentRoleHistory[selected.rollNo].add(role);
        }
    }

    // B. Assign TT Speakers (3)
    const ttRoles = ROLES.slice(12);
    const remainingForTT = studentsForDay.filter(s => !assignedInGroup.has(s.rollNo));
    
    for (let i = 0; i < ttRoles.length; i++) {
        const role = ttRoles[i];
        const selected = remainingForTT[i];
        
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
