import { RenderModel } from '../../src/render-model/render-model.types';

export function sampleModel(over: Partial<RenderModel> = {}): RenderModel {
  return {
    schemaVersion: 1, template: { id: 'ats-classic', version: 1 }, page: { size: 'A4', marginPt: 54 },
    theme: { fontFamily: 'Helvetica', baseSizePt: 10.5, accent: '#000000', headingTransform: 'none', headerAlign: 'left', sectionRule: false } as never,
    header: { name: 'Ada Lovelace', headline: 'Senior Backend Engineer', contacts: ['ada@example.com', '+44 20 7946 0000', 'London'], links: [{ label: 'Site', url: 'https://ada.dev' }] },
    sections: [
      { type: 'summary', title: 'Summary', text: 'Backend engineer building reliable APIs for payments platforms.' },
      {
        type: 'experience', title: 'Experience', items: [
          {
            title: 'Senior Backend Engineer', subtitle: 'Babbage & Co, London', meta: 'Jan 2020 – Present',
            bullets: [
              'Built REST APIs with NestJS and PostgreSQL serving 2M requests per day.',
              'Led migration of services to Docker and AWS, cutting deploy time by 60%.',
              'Reviewed code and mentored four engineers.',
            ],
          },
          {
            title: 'Software Engineer', subtitle: 'Analytical Ltd', meta: 'Jan 2016 – Dec 2019',
            bullets: ['Developed Python services and wrote unit tests for the billing system.', 'Designed relational schemas in MySQL.'],
          },
        ],
      },
      { type: 'skills', title: 'Skills', items: [{ title: 'Core', tags: ['TypeScript', 'NestJS', 'PostgreSQL', 'Docker', 'AWS', 'Kubernetes', 'Python'] }] },
      { type: 'education', title: 'Education', items: [{ title: 'BSc Mathematics', subtitle: 'University of London' }] },
    ],
    ...over,
  } as RenderModel;
}

export const SAMPLE_JD = `Senior Backend Engineer

About us
We are a friendly company building payments software.

Responsibilities
- Design and build scalable REST APIs for our payments platform
- Lead technical design reviews and mentor junior engineers
- Deploy services on AWS using Docker and Kubernetes

Requirements
- 5+ years of experience with Node.js or Python
- Strong knowledge of PostgreSQL and SQL
- Experience with TypeScript and NestJS
- Bachelor's degree in Computer Science or equivalent experience

Nice to have
- Terraform
- Experience in fintech
`;

export const AUTH = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
export const OTHER = { userId: 'u2', tenantId: 't2', issuer: 'i', subject: 's2' };

/** Recursively freezes an object so any accidental mutation throws in strict mode. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') { Object.freeze(o); Object.values(o as object).forEach((v) => deepFreeze(v)); }
  return o;
}
