/**
 * Static course/branch reference data for the Career profile education form.
 *
 * Education rows store the chosen course in `Education.degree` and the chosen branch
 * (specialisation) in `Education.field`, so resumes keep rendering plain, ATS-safe text.
 * The catalog is deliberately local to the web app: it must work offline and on device,
 * and adding a course must never require a schema or API change.
 */
export interface CourseOption {
  /** Course name written to `Education.degree`. */
  name: string;
  /** Branches / specialisations written to `Education.field`. */
  branches: readonly string[];
}

export const OTHER_COURSE = 'Other (not listed)';

export const COURSE_CATALOG: readonly CourseOption[] = [
  {
    name: "Bachelor of Technology (B.Tech) / Bachelor of Engineering (B.E.)",
    branches: [
      'Computer Science & Engineering', 'Information Technology', 'Electronics & Communication Engineering',
      'Electrical & Electronics Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Chemical Engineering',
      'Aerospace Engineering', 'Automobile Engineering', 'Biotechnology', 'Instrumentation Engineering',
      'Mining Engineering', 'Petroleum Engineering', 'Production Engineering', 'Robotics & Automation',
      'Artificial Intelligence & Data Science',
    ],
  },
  {
    name: 'Bachelor of Science (B.Sc)',
    branches: [
      'Physics', 'Chemistry', 'Mathematics', 'Biology', 'Computer Science', 'Statistics', 'Biotechnology',
      'Microbiology', 'Environmental Science', 'Nursing', 'Agriculture', 'Electronics',
    ],
  },
  {
    name: 'Bachelor of Commerce (B.Com)',
    branches: [
      'General', 'Accounting & Finance', 'Banking & Insurance', 'Computer Applications', 'Taxation',
      'Business Analytics',
    ],
  },
  {
    name: 'Bachelor of Business Administration (BBA)',
    branches: ['General', 'Marketing', 'Finance', 'Human Resources', 'International Business', 'Operations Management'],
  },
  {
    name: 'Bachelor of Computer Applications (BCA)',
    branches: ['General', 'Cloud Computing', 'Data Science', 'Cyber Security', 'Full Stack Development'],
  },
  {
    name: 'Bachelor of Arts (BA)',
    branches: [
      'English', 'History', 'Economics', 'Political Science', 'Psychology', 'Sociology', 'Geography',
      'Journalism & Mass Communication', 'Philosophy',
    ],
  },
  {
    name: 'Master of Technology (M.Tech) / Master of Engineering (M.E.)',
    branches: [
      'Computer Science & Engineering', 'Information Technology', 'Electronics & Communication Engineering',
      'Electrical & Electronics Engineering', 'Mechanical Engineering', 'Civil Engineering',
      'Artificial Intelligence & Machine Learning', 'Data Science', 'Cyber Security', 'Structural Engineering',
    ],
  },
  {
    name: 'Master of Science (M.Sc)',
    branches: [
      'Physics', 'Chemistry', 'Mathematics', 'Biology', 'Computer Science', 'Statistics', 'Biotechnology',
      'Microbiology', 'Environmental Science', 'Data Science',
    ],
  },
  {
    name: 'Master of Business Administration (MBA)',
    branches: [
      'General', 'Finance', 'Marketing', 'Human Resources', 'Operations Management', 'Business Analytics',
      'Information Systems', 'International Business',
    ],
  },
  {
    name: 'Master of Computer Applications (MCA)',
    branches: ['General', 'Data Science', 'Cyber Security', 'Cloud Computing'],
  },
  {
    name: 'Master of Arts (MA)',
    branches: ['English', 'History', 'Economics', 'Political Science', 'Psychology', 'Sociology', 'Journalism & Mass Communication'],
  },
  {
    name: 'Bachelor of Medicine, Bachelor of Surgery (MBBS)',
    branches: ['General Medicine'],
  },
  {
    name: 'Bachelor of Pharmacy (B.Pharm)',
    branches: ['General', 'Pharmaceutical Chemistry', 'Pharmacology', 'Pharmaceutics'],
  },
  {
    name: 'Master of Pharmacy (M.Pharm)',
    branches: ['General', 'Pharmaceutical Chemistry', 'Pharmacology', 'Pharmaceutics', 'Regulatory Affairs'],
  },
  {
    name: 'Bachelor of Laws (LLB)',
    branches: ['General', 'Corporate Law', 'Criminal Law', 'Constitutional Law'],
  },
  {
    name: 'Bachelor of Education (B.Ed)',
    branches: ['General', 'Science', 'Mathematics', 'Social Science', 'Languages'],
  },
  {
    name: 'Bachelor of Architecture (B.Arch)',
    branches: ['General', 'Urban Planning', 'Landscape Architecture'],
  },
  {
    name: 'Bachelor of Design (B.Des)',
    branches: ['Graphic Design', 'UI/UX Design', 'Product Design', 'Fashion Design', 'Interior Design'],
  },
  {
    name: 'Bachelor of Hotel Management (BHM)',
    branches: ['General', 'Culinary Arts', 'Hospitality Operations'],
  },
  {
    name: 'Diploma',
    branches: [
      'Computer Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering',
      'Electronics Engineering', 'Business Management', 'Nursing',
    ],
  },
  {
    name: 'Higher Secondary (12th)',
    branches: ['Science (PCM)', 'Science (PCB)', 'Commerce', 'Arts / Humanities', 'Vocational'],
  },
  {
    name: 'High School (10th)',
    branches: ['General'],
  },
  {
    name: OTHER_COURSE,
    branches: ['General'],
  },
];

export const COURSE_NAMES: readonly string[] = COURSE_CATALOG.map((c) => c.name);

/** Branches listed for a course. Unknown/legacy values simply get no catalog branches. */
export function branchesFor(course: string | null | undefined): string[] {
  const name = (course ?? '').trim();
  const hit = COURSE_CATALOG.find((c) => c.name === name);
  return hit ? [...hit.branches] : [];
}

/**
 * Keep a value that is already stored on the profile selectable even when it is not in the
 * catalog (profiles imported before the catalog existed must not render as an empty row).
 */
export function withSavedOption(options: readonly string[], saved: string | null | undefined): string[] {
  const value = (saved ?? '').trim();
  if (!value || options.includes(value)) return [...options];
  return [value, ...options];
}
