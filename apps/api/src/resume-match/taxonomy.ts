/**
 * Versioned skill taxonomy used by the deterministic matcher (docs 23, 29).
 * `aliases` are exact synonyms (same skill). `related` lists adjacent skills (a different skill that offers partial support).
 * Bump TAXONOMY_VERSION whenever entries change; reports record the scoring version that embeds it.
 */
export const TAXONOMY_VERSION = '1.0.0';

export type SkillCategory = 'language' | 'framework' | 'database' | 'cloud' | 'practice' | 'tool' | 'domain' | 'soft';

export interface SkillEntry {
  id: string;
  label: string;
  category: SkillCategory;
  aliases: string[];
  related?: string[];
}

const S = (id: string, label: string, category: SkillCategory, aliases: string[] = [], related: string[] = []): SkillEntry =>
  ({ id, label, category, aliases: [label.toLowerCase(), ...aliases], related });

export const SKILLS: SkillEntry[] = [
  S('javascript', 'JavaScript', 'language', ['js', 'ecmascript', 'es6'], ['typescript', 'nodejs']),
  S('typescript', 'TypeScript', 'language', ['ts'], ['javascript']),
  S('python', 'Python', 'language', ['python3'], []),
  S('java', 'Java', 'language', [], ['kotlin']),
  S('kotlin', 'Kotlin', 'language', [], ['java']),
  S('csharp', 'C#', 'language', ['c sharp', 'csharp'], ['dotnet']),
  S('cpp', 'C++', 'language', ['cpp'], ['c']),
  S('c', 'C', 'language', ['c programming'], ['cpp']),
  S('go', 'Go', 'language', ['golang'], []),
  S('rust', 'Rust', 'language', [], []),
  S('ruby', 'Ruby', 'language', [], ['rails']),
  S('php', 'PHP', 'language', [], ['laravel']),
  S('swift', 'Swift', 'language', [], ['kotlin']),
  S('sql', 'SQL', 'language', [], ['postgresql', 'mysql']),
  S('scala', 'Scala', 'language', [], ['java']),

  S('react', 'React', 'framework', ['reactjs', 'react.js'], ['angular', 'vue']),
  S('angular', 'Angular', 'framework', ['angularjs', 'angular 2+'], ['react', 'vue']),
  S('vue', 'Vue', 'framework', ['vuejs', 'vue.js'], ['react', 'angular']),
  S('nodejs', 'Node.js', 'framework', ['node', 'nodejs', 'node js'], ['javascript']),
  S('nestjs', 'NestJS', 'framework', ['nest.js', 'nest js'], ['nodejs', 'express']),
  S('express', 'Express.js', 'framework', ['expressjs', 'express js'], ['nodejs']),
  S('django', 'Django', 'framework', [], ['python', 'flask']),
  S('flask', 'Flask', 'framework', [], ['python', 'django']),
  S('spring', 'Spring Boot', 'framework', ['springboot', 'spring framework'], ['java']),
  S('dotnet', '.NET', 'framework', ['dotnet', 'asp.net', '.net core'], ['csharp']),
  S('rails', 'Ruby on Rails', 'framework', ['rails', 'ror'], ['ruby']),
  S('laravel', 'Laravel', 'framework', [], ['php']),
  S('graphql', 'GraphQL', 'framework', [], ['rest']),
  S('rest', 'REST APIs', 'framework', ['rest api', 'restful', 'restful apis'], ['graphql']),
  S('ionic', 'Ionic', 'framework', [], ['angular', 'capacitor']),
  S('capacitor', 'Capacitor', 'framework', [], ['ionic']),
  S('flutter', 'Flutter', 'framework', [], ['reactnative']),
  S('reactnative', 'React Native', 'framework', ['react-native'], ['react', 'flutter']),

  S('postgresql', 'PostgreSQL', 'database', ['postgres', 'psql'], ['sql', 'mysql']),
  S('mysql', 'MySQL', 'database', ['mariadb'], ['sql', 'postgresql']),
  S('mongodb', 'MongoDB', 'database', ['mongo'], ['nosql']),
  S('redis', 'Redis', 'database', [], ['nosql']),
  S('nosql', 'NoSQL', 'database', [], ['mongodb']),
  S('elasticsearch', 'Elasticsearch', 'database', ['elastic search', 'opensearch'], []),
  S('prisma', 'Prisma', 'database', [], ['sql']),
  S('kafka', 'Kafka', 'tool', ['apache kafka'], ['rabbitmq']),
  S('rabbitmq', 'RabbitMQ', 'tool', [], ['kafka']),

  S('aws', 'AWS', 'cloud', ['amazon web services', 'ec2', 's3', 'lambda'], ['azure', 'gcp']),
  S('azure', 'Azure', 'cloud', ['microsoft azure'], ['aws', 'gcp']),
  S('gcp', 'GCP', 'cloud', ['google cloud', 'google cloud platform'], ['aws', 'azure']),
  S('docker', 'Docker', 'tool', ['containers', 'containerization', 'containerisation'], ['kubernetes']),
  S('kubernetes', 'Kubernetes', 'tool', ['k8s'], ['docker']),
  S('terraform', 'Terraform', 'tool', ['infrastructure as code', 'iac'], ['ansible']),
  S('ansible', 'Ansible', 'tool', [], ['terraform']),
  S('cicd', 'CI/CD', 'practice', ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment', 'github actions', 'jenkins', 'gitlab ci'], ['devops']),
  S('devops', 'DevOps', 'practice', [], ['cicd']),
  S('git', 'Git', 'tool', ['github', 'gitlab', 'version control'], []),
  S('jira', 'Jira', 'tool', [], []),
  S('linux', 'Linux', 'tool', ['unix'], []),
  S('playwright', 'Playwright', 'tool', [], ['selenium', 'cypress']),
  S('selenium', 'Selenium', 'tool', [], ['playwright', 'cypress']),
  S('cypress', 'Cypress', 'tool', [], ['playwright', 'selenium']),
  S('jest', 'Jest', 'tool', [], ['unittesting']),
  S('unittesting', 'Unit testing', 'practice', ['unit tests', 'unit testing', 'tdd', 'test-driven development'], ['jest']),

  S('microservices', 'Microservices', 'practice', ['micro-services', 'microservice'], ['distributed']),
  S('distributed', 'Distributed systems', 'practice', ['distributed system'], ['microservices']),
  S('agile', 'Agile', 'practice', ['scrum', 'kanban', 'sprint planning'], []),
  S('codereview', 'Code review', 'practice', ['code reviews', 'peer review'], []),
  S('systemdesign', 'System design', 'practice', ['software architecture', 'architecture design'], ['microservices']),
  S('machinelearning', 'Machine learning', 'practice', ['ml', 'deep learning'], ['python']),
  S('dataanalysis', 'Data analysis', 'practice', ['data analytics'], ['sql']),
  S('security', 'Application security', 'practice', ['appsec', 'owasp', 'secure coding'], []),
  S('accessibility', 'Accessibility', 'practice', ['wcag', 'a11y'], []),

  S('leadership', 'Leadership', 'soft', ['team lead', 'led a team', 'led teams', 'mentoring', 'mentored', 'people management'], []),
  S('communication', 'Communication', 'soft', ['stakeholder management', 'stakeholder communication'], []),
  S('projectmgmt', 'Project management', 'soft', ['program management', 'project planning'], ['agile']),

  S('fintech', 'Fintech', 'domain', ['financial services', 'payments', 'banking'], []),
  S('healthcare', 'Healthcare', 'domain', ['health care', 'healthtech', 'clinical'], []),
  S('ecommerce', 'E-commerce', 'domain', ['ecommerce', 'online retail'], []),
  S('saas', 'SaaS', 'domain', ['software as a service'], []),
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
export const skillById = (id: string) => BY_ID.get(id);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Token-boundary regex that treats +, #, . and alphanumerics as part of a term (so "C" never matches "C++" or "Cypress"). */
function termRegex(alias: string): RegExp {
  return new RegExp(`(?<![a-z0-9+#.])${escapeRe(alias)}(?![a-z0-9+#]|\\.[a-z0-9])`, 'i');
}

interface CompiledSkill { entry: SkillEntry; res: Array<{ alias: string; re: RegExp }> }
const COMPILED: CompiledSkill[] = SKILLS.map((entry) => ({
  entry,
  // 'Go' and 'C' are ambiguous English/letter tokens: only the explicit aliases are used, never the bare label.
  res: [...new Set(entry.aliases)].filter((a) => !(['go', 'c'].includes(a))).map((alias) => ({ alias, re: termRegex(alias) })),
}));

export interface SkillHit { id: string; alias: string; exactLabel: boolean }

/** Every literal spelling of a taxonomy skill found in `text` (case preserved), used for consistency checks. */
export function findSkillSpellings(text: string): Array<{ id: string; alias: string; spelling: string }> {
  const out: Array<{ id: string; alias: string; spelling: string }> = [];
  for (const { entry, res } of COMPILED) {
    for (const { alias, re } of res) {
      const g = new RegExp(re.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = g.exec(text))) out.push({ id: entry.id, alias, spelling: m[0] });
    }
  }
  return out;
}

/** All taxonomy skills mentioned in `text`, with the alias that matched (exact label vs synonym). */
export function findSkills(text: string): SkillHit[] {
  const out: SkillHit[] = [];
  for (const { entry, res } of COMPILED) {
    for (const { alias, re } of res) {
      if (re.test(text)) { out.push({ id: entry.id, alias, exactLabel: alias === entry.label.toLowerCase() }); break; }
    }
  }
  return out;
}

export function mentionsSkill(text: string, id: string): SkillHit | null {
  const c = COMPILED.find((x) => x.entry.id === id);
  if (!c) return null;
  for (const { alias, re } of c.res) if (re.test(text)) return { id, alias, exactLabel: alias === c.entry.label.toLowerCase() };
  return null;
}

/** Normalizes a free-text label to a taxonomy id if the whole label (or its only skill) names one. */
export function normalizeLabel(label: string): string | null {
  const hits = findSkills(label);
  if (hits.length === 1) return hits[0].id;
  const lower = label.trim().toLowerCase();
  const exact = SKILLS.find((s) => s.aliases.includes(lower));
  return exact?.id ?? null;
}
