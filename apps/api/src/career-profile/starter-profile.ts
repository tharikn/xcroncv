import { UpsertProfileDto } from './dto/profile.dto';

/**
 * Canonical starter profile restored by the "Reset profile" action.
 *
 * This is intentionally NOT `SAMPLE_PROFILE`: that constant is fictional gallery/preview data
 * and is never allowed to enter a user's career profile. The starter profile is editable
 * example content the user is expected to replace with their own details.
 */
export const STARTER_PROFILE: UpsertProfileDto = {
  fullName: 'Your Name',
  headline: 'Your professional headline',
  email: 'you@example.com',
  phone: '+1 555 010 0100',
  location: 'City, Country',
  links: [{ label: 'Portfolio', url: 'https://example.com' }],
  summary:
    'Write a short, results-focused summary of your experience and the value you bring to a team.',
  experiences: [
    {
      employerName: 'Example Company',
      jobTitle: 'Your Job Title',
      employmentType: 'Full-time',
      location: 'City, Country',
      startDate: '2022-01',
      isCurrent: true,
      description: 'Describe your role, the team you worked with and the problems you solved.',
      bullets: [
        { kind: 'ACHIEVEMENT', content: 'Describe a measurable result, e.g. "Reduced load time by 30%".', isUserConfirmed: true },
        { kind: 'RESPONSIBILITY', content: 'Describe a responsibility you owned day to day.', isUserConfirmed: true },
      ],
    },
  ],
  skills: [
    { name: 'Your main skill', category: 'Core', proficiency: 'Advanced' },
    { name: 'A second skill', category: 'Core', proficiency: 'Intermediate' },
  ],
  educations: [
    { institution: 'Your University', degree: 'Your Degree', field: 'Your field of study', startDate: '2018-09', endDate: '2022-05' },
  ],
  projects: [
    {
      name: 'Your project',
      url: 'https://example.com/project',
      description: 'What you built, why it mattered and what you learned.',
      technologies: ['Technology 1', 'Technology 2'],
    },
  ],
  certifications: [
    { name: 'Your certification', issuer: 'Issuing organisation', issuedDate: '2023-01' },
  ],
  languages: [
    { name: 'English', proficiency: 'Native' },
  ],
};
