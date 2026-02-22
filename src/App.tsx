import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, Lock, Unlock, Edit2, Save, Plus, Database } from 'lucide-react';
import { Student, students as allStudentsList } from './data/students';
import { supabase } from './lib/supabase';
import { generateScheduleLogic } from './utils/scheduler-backend';

interface RoleEntry {
  id: number;
  role: string;
  student: Student;
}

interface DaySchedule {
  date: string;
  day: string;
  theme: string | null;
  roles: RoleEntry[];
}

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

export default function App() {
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [editingTheme, setEditingTheme] = useState<string | null>(null);
  const [themeInput, setThemeInput] = useState("");
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [roleInput, setRoleInput] = useState(""); // Roll No
  const [loading, setLoading] = useState(true);

  // New Month Generation State
  const [showGenerate, setShowGenerate] = useState(false);
  const [newMonthDates, setNewMonthDates] = useState(""); // Text area input

  useEffect(() => {
    fetchSchedule();
    seedStudentsIfEmpty();
  }, []);

  const seedStudentsIfEmpty = async () => {
    const { count, error } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    if (!error && count === 0) {
      console.log("Seeding students to Supabase...");
      const studentsToInsert = allStudentsList.map(s => ({
        roll_no: s.rollNo,
        name: s.name
      }));
      await supabase.from('students').insert(studentsToInsert);
    }
  };

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const { data: daysData, error: daysError } = await supabase
        .from('days')
        .select('*');

      const { data: assignData, error: assignError } = await supabase
        .from('assignments')
        .select('*, students(name)');

      if (daysError || assignError) throw daysError || assignError;

      // Group by day
      const formattedSchedule: DaySchedule[] = daysData.map(day => {
        const dayAssignments = assignData.filter(a => a.date === day.date);
        return {
          date: day.date,
          day: day.day_name,
          theme: day.theme,
          roles: dayAssignments.map(a => ({
            id: a.id,
            role: a.role,
            student: {
              rollNo: a.student_roll_no,
              name: a.students?.name || 'Unknown'
            }
          }))
        };
      });

      // Sort schedule by date (DD.MM.YYYY)
      formattedSchedule.sort((a, b) => {
        const [d1, m1, y1] = a.date.split('.').map(Number);
        const [d2, m2, y2] = b.date.split('.').map(Number);
        return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
      });

      setSchedule(formattedSchedule);
    } catch (error) {
      console.error("Failed to fetch schedule", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowLogin(false);
      setPassword("");
    } else {
      alert("Invalid password");
    }
  };

  const handleUpdateTheme = async (date: string) => {
    const { error } = await supabase
      .from('days')
      .update({ theme: themeInput })
      .eq('date', date);

    if (error) alert("Failed to update theme: " + error.message);
    else {
      setEditingTheme(null);
      fetchSchedule();
    }
  };

  const handleUpdateRole = async (assignmentId: number) => {
    const student = allStudentsList.find(s => s.rollNo === roleInput);
    if (!student) {
      alert("Invalid Roll Number");
      return;
    }

    const { error } = await supabase
      .from('assignments')
      .update({ student_roll_no: roleInput })
      .eq('id', assignmentId);

    if (error) alert("Failed to update role: " + error.message);
    else {
      setEditingRole(null);
      fetchSchedule();
    }
  };

  const handleGenerate = async () => {
    const lines = newMonthDates.trim().split('\n');
    const newDaysRequested = lines.map(line => {
      const parts = line.split(/\s+/);
      if (parts.length < 2) return null;
      return { date: parts[0], day: parts.slice(1).join(' ') };
    }).filter((d): d is { date: string; day: string } => d !== null);

    if (newDaysRequested.length === 0) {
      alert("No valid dates found. Format: DD.MM.YYYY DayName");
      return;
    }

    // Get current history from Supabase
    const { data: assignments } = await supabase.from('assignments').select('student_roll_no, role');
    const { data: students } = await supabase.from('students').select('*');
    const { data: existingDays } = await supabase.from('days').select('date');

    const existingDates = new Set((existingDays || []).map(d => d.date));
    const uniqueNewDays = newDaysRequested.filter(d => !existingDates.has(d.date));

    if (uniqueNewDays.length === 0) {
      alert("All these dates already exist in the schedule.");
      return;
    }

    const history: Record<string, Set<string>> = {};
    (students || []).forEach(s => history[(s as any).roll_no] = new Set());
    (assignments || []).forEach(a => {
      if (history[a.student_roll_no]) history[a.student_roll_no].add(a.role);
    });

    const studentList: Student[] = (students || []).map(s => ({
      rollNo: (s as any).roll_no,
      name: (s as any).name
    }));

    const generated = generateScheduleLogic(uniqueNewDays, studentList, history);

    // Insert to Supabase
    for (const entry of generated) {
      const { error: dayErr } = await supabase.from('days').insert({
        date: entry.date,
        day_name: entry.day
      });
      if (dayErr) console.error("Error inserting day", dayErr);

      const assignmentsToInsert = entry.roles.map(r => ({
        date: entry.date,
        role: r.role,
        student_roll_no: r.student.rollNo
      }));
      const { error: assignErr } = await supabase.from('assignments').insert(assignmentsToInsert);
      if (assignErr) console.error("Error inserting assignments", assignErr);
    }

    setShowGenerate(false);
    setNewMonthDates("");
    fetchSchedule();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Toastmasters Schedule</h1>
            <p className="mt-2 text-gray-600">ECE-B Class • Connected to Supabase</p>
          </div>
          <div className="flex gap-4">
            {!isAdmin ? (
              <button
                onClick={() => setShowLogin(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Lock className="h-4 w-4 mr-2" />
                Admin Login
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowGenerate(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Month
                </button>
                <button
                  onClick={() => setIsAdmin(false)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Login Modal */}
        {showLogin && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
              <h2 className="text-xl font-bold mb-4">Admin Login</h2>
              <form onSubmit={handleLogin}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Password"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogin(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                  >
                    Login
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Generate Modal */}
        {showGenerate && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
              <h2 className="text-xl font-bold mb-4">Add Next Month Schedule</h2>
              <p className="text-sm text-gray-500 mb-2">
                Enter dates and days (one per line).<br />
                Format: <code>DD.MM.YYYY DayName</code><br />
                Example:<br />
                01.04.2026 Wednesday<br />
                02.04.2026 Thursday
              </p>
              <textarea
                value={newMonthDates}
                onChange={(e) => setNewMonthDates(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 mb-4 h-48 font-mono text-sm focus:ring-2 focus:ring-green-500 outline-none"
                placeholder="01.04.2026 Wednesday..."
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGenerate(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Table */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">Theme</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">Student Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">Roll No</th>
                  {isAdmin && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">Action</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-6 py-10 text-center text-gray-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading schedule...
                    </td>
                  </tr>
                ) : schedule.length > 0 ? (
                  schedule.map((day, dayIdx) => (
                    day.roles.map((roleEntry, roleIdx) => (
                      <tr key={roleEntry.id} className={dayIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-indigo-50/30 transition-colors'}>
                        {roleIdx === 0 && (
                          <>
                            <td
                              className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-200 align-top bg-white"
                              rowSpan={day.roles.length}
                            >
                              <div className="sticky top-0">
                                <div>{day.date}</div>
                                <div className="text-gray-500 text-xs font-normal">{day.day}</div>
                              </div>
                            </td>
                            <td
                              className="px-6 py-4 text-sm text-gray-900 border border-gray-200 align-top bg-white min-w-[200px]"
                              rowSpan={day.roles.length}
                            >
                              {editingTheme === day.date ? (
                                <div className="flex flex-col gap-2">
                                  <textarea
                                    value={themeInput}
                                    onChange={(e) => setThemeInput(e.target.value)}
                                    className="border rounded p-1 text-sm w-full focus:ring-1 focus:ring-blue-500 outline-none"
                                    rows={3}
                                  />
                                  <div className="flex gap-1">
                                    <button onClick={() => handleUpdateTheme(day.date)} className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">Save</button>
                                    <button onClick={() => setEditingTheme(null)} className="text-xs bg-gray-300 px-2 py-1 rounded hover:bg-gray-400">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="group relative">
                                  <div className="whitespace-pre-wrap">{day.theme || <span className="text-gray-400 italic">No theme set</span>}</div>
                                  {isAdmin && (
                                    <button
                                      onClick={() => { setEditingTheme(day.date); setThemeInput(day.theme || ""); }}
                                      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity"
                                      title="Edit Theme"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 border border-gray-200">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleEntry.role.startsWith('Speaker') ? 'bg-green-100 text-green-800' :
                              roleEntry.role.startsWith('Evaluator') ? 'bg-blue-100 text-blue-800' :
                                roleEntry.role.startsWith('TT') ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                            }`}>
                            {roleEntry.role}
                          </span>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900 border border-gray-200 font-medium">
                          {roleEntry.student.name}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 border border-gray-200 font-mono">
                          {editingRole === roleEntry.id ? (
                            <div className="flex gap-1 items-center">
                              <input
                                value={roleInput}
                                onChange={(e) => setRoleInput(e.target.value)}
                                className="border rounded px-1 py-0.5 w-24 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                placeholder="Roll No"
                                autoFocus
                              />
                              <button onClick={() => handleUpdateRole(roleEntry.id)} className="text-green-600 hover:text-green-700" title="Save Changes"><Save className="h-4 w-4" /></button>
                              <button onClick={() => setEditingRole(null)} className="text-red-600 hover:text-red-700 font-bold" title="Cancel">×</button>
                            </div>
                          ) : (
                            roleEntry.student.rollNo
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 border border-gray-200">
                            <button
                              onClick={() => { setEditingRole(roleEntry.id); setRoleInput(roleEntry.student.rollNo); }}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit Student"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ))
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-6 py-10 text-center text-gray-500">
                      No schedule found in Supabase. {isAdmin ? "Click 'Add Month' to generate the first schedule." : "Please contact the admin to initialize the schedule."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
