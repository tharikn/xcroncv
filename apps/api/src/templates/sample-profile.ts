import { ProfileInput } from '../render-model/render-model.builder';

/**
 * Fictional, static dummy resume used ONLY to show what a template looks like (gallery cards and template preview).
 * Never read from or mixed with a user's career profile.
 */
export const SAMPLE_PROFILE: ProfileInput = {
  fullName: 'Alex Morgan',
  headline: 'Senior Product Designer',
  email: 'alex.morgan@example.com',
  phone: '+1 555 010 0199',
  location: 'Austin, TX',
  links: [{ label: 'Portfolio', url: 'https://example.com/alex' }],
  summary: 'Product designer with 8 years of experience shipping accessible, data-informed interfaces for web and mobile. Partners closely with engineering and research to turn ambiguous problems into clear, measurable outcomes.',
  experiences: [
    {
      employerName: 'Northwind Labs', jobTitle: 'Senior Product Designer', location: 'Austin, TX',
      startDate: '2021-03', endDate: null, isCurrent: true,
      bullets: [
        { content: 'Led the redesign of the onboarding flow, lifting activation by 18%.' },
        { content: 'Built a shared design system adopted by 6 product teams.' },
        { content: 'Mentored 3 designers and ran weekly critique sessions.' },
      ],
    },
    {
      employerName: 'Brightside Studio', jobTitle: 'Product Designer', location: 'Remote',
      startDate: '2018-06', endDate: '2021-02', isCurrent: false,
      bullets: [
        { content: 'Delivered mobile and web designs for 12 client launches.' },
        { content: 'Cut design-to-development handoff time by 30% with documented components.' },
      ],
    },
  ],
  skills: [
    { name: 'Interaction design' }, { name: 'Design systems' }, { name: 'Prototyping' },
    { name: 'User research' }, { name: 'Accessibility' }, { name: 'Figma' },
  ],
  educations: [{ institution: 'State University', degree: 'B.A. Graphic Design', startDate: '2012-09', endDate: '2016-05' }],
  projects: [{ name: 'Open Components Kit', url: 'https://example.com/kit', description: 'Open-source accessible UI kit.', technologies: ['Figma', 'TypeScript'] }],
  certifications: [{ name: 'Certified Usability Analyst', issuer: 'HFI', issuedDate: '2019-04' }],
  languages: [{ name: 'English', proficiency: 'Native' }, { name: 'Spanish', proficiency: 'Conversational' }],
};
