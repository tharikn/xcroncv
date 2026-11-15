/**
 * Versioned role taxonomy for explainable career paths (doc 44, P0). Deterministic: no model, no market data.
 * Ship a new TAXONOMY_VERSION instead of editing meaning in place.
 */
export const TAXONOMY_VERSION = '1';

export interface SkillReq { label: string; aliases: string[] }
export interface Role {
  id: string; title: string; family: string; summary: string;
  /** Substrings of a job title that suggest the candidate currently works in this role. */
  titleHints: string[];
  required: SkillReq[];
  adjacent: string[];
}

const s = (label: string, ...aliases: string[]): SkillReq => ({ label, aliases: [label.toLowerCase(), ...aliases] });

export const ROLES: Role[] = [
  { id: 'backend-engineer', title: 'Backend Engineer', family: 'Engineering', summary: 'Builds services, APIs and data storage.', titleHints: ['backend', 'back-end', 'api developer', 'software engineer'],
    required: [s('REST APIs', 'rest', 'restful', 'api'), s('SQL', 'postgresql', 'postgres', 'mysql', 'sql'), s('A server-side language', 'node.js', 'nodejs', 'java', 'python', 'go', 'c#', 'typescript'), s('Testing', 'unit test', 'jest', 'junit', 'pytest'), s('Git', 'git'), s('Docker', 'docker', 'container')],
    adjacent: ['fullstack-engineer', 'devops-engineer', 'data-engineer', 'solutions-architect'] },
  { id: 'frontend-engineer', title: 'Frontend Engineer', family: 'Engineering', summary: 'Builds user interfaces for web and mobile web.', titleHints: ['frontend', 'front-end', 'ui developer', 'web developer'],
    required: [s('HTML and CSS', 'html', 'css', 'scss'), s('JavaScript or TypeScript', 'javascript', 'typescript'), s('A UI framework', 'angular', 'react', 'vue', 'svelte'), s('Accessibility', 'accessibility', 'wcag', 'a11y'), s('Testing', 'jest', 'playwright', 'cypress', 'unit test'), s('Git', 'git')],
    adjacent: ['fullstack-engineer', 'qa-automation-engineer', 'product-manager'] },
  { id: 'fullstack-engineer', title: 'Full-stack Engineer', family: 'Engineering', summary: 'Works across user interface, services and data.', titleHints: ['full stack', 'full-stack', 'fullstack'],
    required: [s('JavaScript or TypeScript', 'javascript', 'typescript'), s('A UI framework', 'angular', 'react', 'vue'), s('REST APIs', 'rest', 'restful', 'api'), s('SQL', 'postgresql', 'postgres', 'mysql', 'sql'), s('Testing', 'jest', 'playwright', 'unit test'), s('Git', 'git')],
    adjacent: ['backend-engineer', 'frontend-engineer', 'engineering-manager', 'solutions-architect'] },
  { id: 'devops-engineer', title: 'DevOps / Platform Engineer', family: 'Infrastructure', summary: 'Automates delivery and runs reliable infrastructure.', titleHints: ['devops', 'sre', 'platform engineer', 'infrastructure'],
    required: [s('CI/CD', 'ci/cd', 'github actions', 'jenkins', 'gitlab ci', 'pipeline'), s('Docker', 'docker', 'container'), s('Kubernetes', 'kubernetes', 'k8s'), s('Cloud platform', 'aws', 'azure', 'gcp', 'google cloud'), s('Infrastructure as code', 'terraform', 'ansible', 'cloudformation', 'pulumi'), s('Monitoring', 'prometheus', 'grafana', 'monitoring', 'observability')],
    adjacent: ['backend-engineer', 'solutions-architect'] },
  { id: 'data-engineer', title: 'Data Engineer', family: 'Data', summary: 'Builds pipelines and data platforms.', titleHints: ['data engineer', 'etl', 'analytics engineer'],
    required: [s('SQL', 'sql', 'postgresql', 'mysql'), s('Python', 'python'), s('Data pipelines', 'etl', 'elt', 'pipeline', 'airflow', 'dbt'), s('Cloud platform', 'aws', 'azure', 'gcp'), s('Data modelling', 'data model', 'warehouse', 'star schema'), s('Git', 'git')],
    adjacent: ['backend-engineer', 'data-analyst'] },
  { id: 'data-analyst', title: 'Data Analyst', family: 'Data', summary: 'Turns data into decisions and reports.', titleHints: ['data analyst', 'business analyst', 'bi analyst'],
    required: [s('SQL', 'sql'), s('Spreadsheets', 'excel', 'spreadsheet', 'google sheets'), s('Data visualisation', 'tableau', 'power bi', 'looker', 'dashboard', 'visualization', 'visualisation'), s('Statistics', 'statistics', 'statistical', 'a/b test'), s('Python or R', 'python', 'r')],
    adjacent: ['data-engineer', 'product-manager'] },
  { id: 'qa-automation-engineer', title: 'QA Automation Engineer', family: 'Quality', summary: 'Designs automated tests and quality gates.', titleHints: ['qa', 'quality assurance', 'sdet', 'test engineer'],
    required: [s('Test automation', 'selenium', 'playwright', 'cypress', 'automation', 'test automation'), s('A scripting language', 'javascript', 'typescript', 'python', 'java'), s('API testing', 'postman', 'api test', 'rest'), s('CI/CD', 'ci/cd', 'jenkins', 'github actions', 'pipeline'), s('Test design', 'test plan', 'test case', 'regression')],
    adjacent: ['frontend-engineer', 'backend-engineer'] },
  { id: 'engineering-manager', title: 'Engineering Manager', family: 'Leadership', summary: 'Leads a team and its delivery.', titleHints: ['engineering manager', 'team lead', 'tech lead', 'head of engineering'],
    required: [s('Mentoring', 'mentor', 'coached', 'coaching'), s('Hiring', 'hiring', 'interview', 'recruit'), s('Delivery planning', 'roadmap', 'sprint', 'planning', 'delivery'), s('Stakeholder communication', 'stakeholder', 'cross-functional'), s('Technical depth', 'architecture', 'code review', 'design review')],
    adjacent: ['fullstack-engineer', 'product-manager', 'solutions-architect'] },
  { id: 'product-manager', title: 'Product Manager', family: 'Product', summary: 'Decides what to build and why.', titleHints: ['product manager', 'product owner'],
    required: [s('Roadmapping', 'roadmap', 'prioritisation', 'prioritization'), s('User research', 'user research', 'interview', 'survey', 'usability'), s('Metrics', 'metrics', 'kpi', 'analytics', 'a/b test'), s('Stakeholder communication', 'stakeholder', 'cross-functional'), s('Requirements writing', 'requirements', 'user stories', 'specification')],
    adjacent: ['engineering-manager', 'data-analyst'] },
  { id: 'solutions-architect', title: 'Solutions Architect', family: 'Architecture', summary: 'Designs systems across teams and vendors.', titleHints: ['architect'],
    required: [s('System design', 'architecture', 'system design', 'microservices'), s('Cloud platform', 'aws', 'azure', 'gcp'), s('Security basics', 'security', 'oauth', 'encryption', 'authentication'), s('Integration', 'integration', 'api', 'messaging', 'queue'), s('Stakeholder communication', 'stakeholder', 'presentation', 'workshop')],
    adjacent: ['backend-engineer', 'devops-engineer', 'engineering-manager'] },
];

export const roleById = (id: string) => ROLES.find((r) => r.id === id);
