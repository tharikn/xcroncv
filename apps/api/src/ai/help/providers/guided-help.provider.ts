import { estimateTokens, looksLikeInjection } from '../../ai-policy';
import { HELP_CHAT_FALLBACK, HELP_CHAT_OFF_TOPIC } from '../prompts/help-chat.prompt';
import { HelpChatProvider, HelpChatTurn } from '../help-chat.types';

type Intent = { id: string; pattern: RegExp; reply: string };

/**
 * Local, offline answers. This is the default path and the fallback when no external
 * provider is configured or the user has not opted in to AI assistance. It only
 * explains the app; it cannot read or change anything in an account.
 */
const INTENTS: Intent[] = [
  {
    id: 'greeting',
    pattern: /^(hi|hello|hey|good (morning|afternoon|evening)|namaste|vanakkam)\b/i,
    reply: 'Hello — I can explain any screen in XCron CV. Ask about resumes, templates, the ATS check, cover letters, your profile or privacy.',
  },
  {
    id: 'template-color',
    pattern: /\b(colour|color|palette|theme)\b/i,
    reply: 'The template uses token-driven colours from your design system. Open the design panel to pick accent, ink or muted shades; they apply across the whole resume and stay ATS-safe.',
  },
  {
    id: 'template-layout',
    pattern: /\b(layout|section|order|arrange|reorder)\b/i,
    reply: 'You can reorder sections in the outline panel on the left. Drag sections up or down, or hide ones you don’t need. The visual editor remembers your preferred order per resume.',
  },
  {
    id: 'template-typography',
    pattern: /\b(font|typeface|size|heading|text)\b/i,
    reply: 'Fonts and sizes are set per section in the design panel. Headings typically use a larger size than body text. The template’s token system ensures ATS‑safe rendering.',
  },
  {
    id: 'template-switch',
    pattern: /\b(switch|change|swap|different)\b[^.]*\b(template|layout)\b/i,
    reply: 'Open the Templates screen to compare layouts. Selecting a new template keeps your content and overrides; only the structure and token-driven styling change.',
  },
  {
    id: 'template-save',
    pattern: /\b(save|saving|saved|autosave|design changes)\b/i,
    reply: 'Your changes are autosaved after a moment of inactivity. You can also save a version from the outline panel to preserve a snapshot of your design.',
  },
  {
    id: 'template-version',
    pattern: /\b(version|snapshot|save version)\b/i,
    reply: 'Use the save version option in the outline panel to capture a snapshot of your current design. You can return to any saved version later.',
  },
  {
    id: 'create-resume',
    pattern: /\b(create|new|build|make|start|add)\b[^.]*\b(resume|cv)\b|\b(resume|cv)\b[^.]*\b(create|new|build|make|start)\b/i,
    reply: 'Open Resumes, then New resume. Fill your career profile once and every resume reuses it. You pick a template next and edit the text directly on the page; changes save automatically and sync to your account.',
  },
  {
    id: 'template',
    pattern: /\b(template|layout|design|style|font|colour|color|theme)\b/i,
    reply: 'Open Templates to compare layouts and pick one; the same option is in the editor’s design panel. Switching a template keeps your content, and colours, fonts and spacing are token-driven so the export stays ATS-safe.',
  },
  {
    id: 'ats',
    pattern: /\b(ats|scan|screen|keyword|parse|parser)\b/i,
    reply: 'Open ATS score, choose a resume and paste one job posting. The score is a fixed rule-based check with an explanation, never an AI guess, and it is separate from job match.',
  },
  {
    id: 'ai-generator',
    pattern: /\b(ai resume|generator|generate|tailor|tailored|job description|jd)\b/i,
    reply: 'Open AI Resume (the sparkles button) and paste or upload one job description. It creates an ATS-first resume plus a matching cover letter from your confirmed profile facts, and the description is discarded after use.',
  },
  {
    id: 'cover-letter',
    pattern: /\b(cover letter|motivation letter|application letter)\b/i,
    reply: 'Open Career tools, then Cover letters. Pick a resume and a role to draft a letter from your confirmed experience, then review every claim and edit before exporting.',
  },
  {
    id: 'profile-sync',
    pattern: /\b(profile|sync|another device|other device|phone|laptop|tablet)\b/i,
    reply: 'Your career profile and resume designs live in your account, not only on one device. Sign in on a phone, tablet or another browser and the resume opens exactly where you left it.',
  },
  {
    id: 'import',
    pattern: /\b(import|upload|pdf|docx|word file|existing resume)\b/i,
    reply: 'Open Career tools, then Import career data, or use Import resume from the profile card. Pick a PDF or DOCX, review every extracted field and merge only what you approve. The file is read in memory and then discarded.',
  },
  {
    id: 'export',
    pattern: /\b(export|download|save|pdf|docx|print)\b/i,
    reply: 'Open a resume and choose Export. The PDF, DOCX, XLSX or HTML file is generated for that request and streamed straight to you; the server never keeps a copy. On a phone it is saved to Documents/XCronCV.',
  },
  {
    id: 'ai-assistant',
    pattern: /\b(ai assistant|suggestion|rewrite|summary|opt in|opt-in|consent|turn on ai|turn ai on|polish)\b/i,
    reply: 'Open Career tools, then AI assistant. AI is off by default: turning it on is your consent. It offers wording suggestions (tidy a bullet, draft a summary, find keyword gaps, tidy a letter, check an interview answer); you review and copy them yourself, and it never changes a score.',
  },
  {
    id: 'privacy',
    pattern: /\b(privacy|private|secure|security|store|stored|server|gdpr|delete my data)\b/i,
    reply: 'Uploads are parsed in memory and zeroed right after extraction, and generated files are streamed back with no server copy. Resume and profile data stay in your account so you can reopen them on any device. You can delete suggestions, versions and reviews from their own screens.',
  },
  {
    id: 'language-theme',
    pattern: /\b(language|english|tamil|hindi|dark mode|light mode|theme|font size)\b/i,
    reply: 'Open Settings to change the app language (English, Tamil or Hindi) or switch between light, dark and system theme. Your choice is saved on the device and on your account.',
  },
  {
    id: 'interview',
    pattern: /\b(interview|practice|answer|question)\b/i,
    reply: 'Open Career tools, then Interview preparation for questions quoted from your saved resume, with text-only feedback on your own answer. Interview copilot does the same for a saved resume version; both are feedback on structure, never a score.',
  },
  {
    id: 'portfolio',
    pattern: /\b(portfolio|public page|share|public link|recruiter)\b/i,
    reply: 'Open Career tools, then Portfolio to publish a page with only the fields you pick. It is private by default; the share link can expire or be revoked, and Recruiter view gives a read-only page from one resume version.',
  },
  {
    id: 'match',
    pattern: /\b(match|gap|missing skill|job fit|fit score)\b/i,
    reply: 'Open Insights, then Job match, or Career tools for the keyword-gap suggestion. Match compares one resume version with one posting using fixed rules and shows which evidence supports each requirement; it never edits your resume for you.',
  },
  {
    id: 'files',
    pattern: /\b(files|folder|device storage|downloads)\b/i,
    reply: 'Files shows the exports you saved on this device (Documents/XCronCV on a phone, the browser downloads folder otherwise). Nothing in that list is uploaded to the server.',
  },
  {
    id: 'thanks',
    pattern: /\b(thanks|thank you|great|perfect|ok|okay)\b/i,
    reply: 'Glad it helped. Ask again any time, or open Career tools to see everything XCron CV can do.',
  },
];

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export class GuidedHelpProvider implements HelpChatProvider {
  readonly id = 'guided';
  readonly model = 'help-rules-v1';
  readonly promptVersion = '1';
  readonly external = false;

  async chat(input: { system: string; history: HelpChatTurn[]; message: string; maxTokens: number }): Promise<{ reply: string; tokensUsed: number }> {
    const message = normalize(input.message);
    let reply: string;

    if (looksLikeInjection(message)) {
      reply = HELP_CHAT_OFF_TOPIC;
    } else {
      const hits = INTENTS.filter((i) => i.pattern.test(message)).slice(0, 2);
      reply = hits.length ? hits.map((h) => h.reply).join('\n\n') : HELP_CHAT_FALLBACK;
    }

    const tokensUsed = estimateTokens(`${input.message} ${reply}`);
    return { reply, tokensUsed };
  }
}
