import { ProfileInput } from '../render-model/render-model.builder';

/**
 * Fictional, static dummy resume used ONLY to show what a template looks like (gallery cards and template preview).
 * Lorem-ipsum-flavoured placeholder prose so end users can judge density, wrapping and section rhythm.
 * Never read from or mixed with a user's career profile.
 */
export const SAMPLE_PROFILE: ProfileInput = {
  fullName: 'Alex Morgan',
  headline: 'Senior Product Designer',
  email: 'alex.morgan@example.com',
  phone: '+1 555 010 0199',
  location: 'Austin, TX',
  links: [{ label: 'Portfolio', url: 'https://example.com/alex' }, { label: 'LinkedIn', url: 'https://example.com/alex-linkedin' }],
  summary: 'Product designer with over eight years of experience shipping accessible, data-informed interfaces for web and mobile. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Partners closely with engineering and research to turn ambiguous problems into clear, measurable outcomes.',
  experiences: [
    {
      employerName: 'Northwind Labs', jobTitle: 'Senior Product Designer', location: 'Austin, TX',
      startDate: '2021-03', endDate: null, isCurrent: true,
      bullets: [
        { content: 'Led the redesign of the onboarding flow, lifting activation by 18% across 40,000 monthly signups.' },
        { content: 'Built a shared design system adopted by 6 product teams and 30+ engineers.' },
        { content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.' },
        { content: 'Mentored 3 product designers and ran a weekly critique and pairing programme.' },
      ],
    },
    {
      employerName: 'Brightside Studio', jobTitle: 'Product Designer', location: 'Remote',
      startDate: '2018-06', endDate: '2021-02', isCurrent: false,
      bullets: [
        { content: 'Delivered mobile and web designs for 12 client launches in fintech, health and education.' },
        { content: 'Cut design-to-development handoff time by 30% with documented components and tokens.' },
        { content: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi.' },
        { content: 'Ran discovery workshops and usability testing with up to 200 participants per quarter.' },
      ],
    },
    {
      employerName: 'Lumen & Co', jobTitle: 'UI Designer', location: 'Austin, TX',
      startDate: '2015-02', endDate: '2018-05', isCurrent: false,
      bullets: [
        { content: 'Designed marketing sites and campaign landing pages for 20+ B2B clients.' },
        { content: 'Quis nostrud exercitation ullamco laboris nisi ut aliquip commodo consequat.' },
        { content: 'Introduced a reusable illustration library that halved production time.' },
      ],
    },
  ],
  skills: [
    { name: 'Interaction design' }, { name: 'Design systems' }, { name: 'Prototyping' },
    { name: 'User research' }, { name: 'Accessibility' }, { name: 'Figma' },
    { name: 'Motion design' }, { name: 'Content design' }, { name: 'Design tokens' },
  ],
  educations: [
    { institution: 'State University', degree: 'B.A. Graphic Design', startDate: '2012-09', endDate: '2016-05' },
    { institution: 'Interaction Design Institute', degree: 'Certificate, UX Foundations', startDate: '2017-03', endDate: '2017-09' },
  ],
  projects: [
    { name: 'Open Components Kit', url: 'https://example.com/kit', description: 'Open-source accessible UI kit with 60+ components, used by 4,000 developers.', technologies: ['Figma', 'TypeScript'] },
    { name: 'Contrast Checker', url: 'https://example.com/contrast', description: 'Lorem ipsum dolor sit amet checker for color pairs across themes.', technologies: ['React', 'TypeScript'] },
  ],
  certifications: [
    { name: 'Certified Usability Analyst', issuer: 'HFI', issuedDate: '2019-04' },
    { name: 'Accessibility Specialist (IAAP WAS)', issuer: 'IAAP', issuedDate: '2022-06' },
  ],
  languages: [{ name: 'English', proficiency: 'Native' }, { name: 'Spanish', proficiency: 'Conversational' }, { name: 'French', proficiency: 'Basic' }],
};
