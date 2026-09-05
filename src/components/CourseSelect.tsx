import { COURSES, coursePoint, type Course } from '@/lib/autorun';

export function Difficulty({ level }: { level: number }) {
  return <span className="difficulty" aria-label={`難易度 ${level} / 5`}><span aria-hidden="true">{'★'.repeat(level)}<i>{'☆'.repeat(5 - level)}</i></span></span>;
}
function RoutePreview({ course }: { course: Course }) {
  const points = Array.from({ length: 45 }, (_, i) => {
    const s = course.length * i / 44, p = coursePoint(s, course);
    return `${12 + i * 3.55},${42 + p.x * .28 - p.y * .35}`;
  }).join(' ');
  return <svg className="course-preview" viewBox="0 0 184 72" aria-hidden="true"><path d="M0 56H184M0 32H184" stroke="currentColor" opacity=".08" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="9" opacity=".12" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export default function CourseSelect({ selected, onSelect, cleared }: { selected: string; onSelect: (course: Course) => void; cleared: Record<string, number> }) {
  return <div className="course-grid" role="group" aria-label="8コースからステージを選択">{COURSES.map((course, i) => <button type="button" className={`course-option ${selected === course.id ? 'selected' : ''}`} key={course.id} aria-pressed={selected === course.id} aria-label={`${i + 1}. ${course.name}、難易度${course.difficulty}、${course.length}メートル`} style={{ color: course.accent }} onClick={e => { onSelect(course); e.currentTarget.blur(); }}><div className="course-top"><span>COURSE {String(i + 1).padStart(2, '0')}</span><b>{selected === course.id ? '✓ 選択中' : cleared[course.id] ? '✓ CLEAR' : `${course.length} m`}</b></div><RoutePreview course={course} /><strong>{course.name}</strong><Difficulty level={course.difficulty} /><small>{course.subtitle}</small></button>)}</div>;
}
