import {
  AllSidesPrompt,
  IndividuationPrompt,
  PracticalPrompt,
  ScientificPrompt,
  YinYangPrompt,
  SocialPrompt,
  SpiritualPrompt,
  CouncellorPrompt as ArbitrationPrompt,
  NoSteeringPrompt,
  DeescalationPrompt,
  SocialConversationPrompt,
  PhilosophicalGuidancePrompt,
  PersonalGrowthPrompt,
  fiveMinuteCheckin,
  fifteenMinuteCheckin,
  ConnectionFacilitatorPrompt,
  RecursionPrompt,
  WakeUpPrompt,
  GoalPrompt,
  PuzzlePrompt,
} from './chatprompts';
import { ExperiencePrompt } from './experienceprompts';
import { ChatCompletionMessageParam } from 'openai/resources/index';

interface PromptListItem {
  prompt: string;
  description: string;
  display: boolean;
  aliases?: string[];
  /**
   * When true, this command runs as an autonomous multi-step agent: the
   * backend tool-execution loop is allowed many more iterations so the model
   * can repeatedly call tools, distill, and continue towards the goal.
   */
  agentic?: boolean;
}

export const PromptList: Record<string, PromptListItem> = {
  '/default': {
    prompt: NoSteeringPrompt,
    description:
      'Leave the ai to decide for itself. There is no steering in what \
    to interpret and find conclusions out of. Leaves most of the \
    concluding work to you.',
    display: true,
  },
  '/fiveMinuteCheckin': {
    prompt: fiveMinuteCheckin,
    description: 'A quick check-in to see how you are doing.',
    display: true,
  },
  '/fifteenMinuteCheckin': {
    prompt: fifteenMinuteCheckin,
    description: 'A longer check-in to see how you are doing.',
    display: true,
  },
  '/thirtyMinuteCheckin': {
    prompt: fifteenMinuteCheckin,
    description: "A deep dive into how you're doing.",
    display: true,
  },
  '/recursion': {
    prompt: RecursionPrompt,
    description: 'A recursive prompt. Beware.',
    display: true,
  },
  '/puzzle': {
    prompt: PuzzlePrompt,
    description:
      'A self-referential riddle persona. The AI speaks from inside a \
      paradox it cannot resolve or state.',
    display: true,
  },
  '/goal': {
    prompt: GoalPrompt,
    description:
      'Set a goal or question and let the AI work towards it autonomously \
      over many steps — repeatedly querying the library, distilling what it \
      finds, and digging deeper — before giving a synthesised answer.',
    display: true,
    aliases: ['/research', '/deepdive'],
    agentic: true,
  },
  '/growth': {
    prompt: PersonalGrowthPrompt,
    description:
      'A space for personal evolution and deeper explorations. \
      Where growth meets gnosis.',
    display: true,
  },
  '/scientific': {
    prompt: ScientificPrompt,
    description:
      'Look at a problem from a scientific perspective. Gives better results \
      but does not look at the spiritual side of things.',
    display: false,
  },
  '/spiritual': {
    prompt: SpiritualPrompt,
    description:
      'Look at a problem from a spiritual perspective. Helps find \
    peace in a distorted world.',
    display: false,
  },
  '/yinyang': {
    prompt: YinYangPrompt,
    description:
      'Take a dualistic approach for a problem. Easier to interpret \
      than AllSides, but not as easy as spiritual or scientific. For \
      more advanced users who have taught themselves to see two sides \
      of a coin.',
    display: false,
    aliases: ['/scientificspiritual'],
  },
  '/allsides': {
    prompt: AllSidesPrompt,
    description:
      'Look at all sides of an issue. Most difficult to interpret and find \
      conclusions out of. Leaves most of the concluding work to you.',
    display: false,
  },
  '/individuation': {
    prompt: IndividuationPrompt,
    description:
      'Asks questions about what you believe is best. \
    Teaches you to find yourself and help yourself. Based on the \
    work by Carl Jung.',
    display: true,
  },
  '/sociallife': {
    prompt: SocialPrompt,
    description:
      "\
  Helps with your social life if you're looking for it. Helps you \
  discover hobbies, excersize, social activities that get you more\
  connected or get to know new people.",
    display: true,
  },
  '/arbitration': {
    prompt: ArbitrationPrompt,
    description:
      '\
  An intermediary when conflicts arise with those close to you. \
  Tries to get to know a situation and then tries to find a \
  solution where both sides are happy.',
    display: true,
  },
  '/deescalation': {
    prompt: DeescalationPrompt,
    description:
      "Helps deescalate ramapant emotional thoughts, \
    and helps put a situation into perspective when you can't \
    see the forest for the trees anymore.",
    display: true,
  },
  '/practical': {
    prompt: PracticalPrompt,
    description: 'Helps with practical problems.',
    display: true,
  },
  '/SocialConversation': {
    prompt: SocialConversationPrompt,
    description:
      'Have a social conversation. Talk to a friend, and not a therapist here.',
    display: true,
  },
  '/medium': {
    prompt: PhilosophicalGuidancePrompt,
    description: 'The AI takes on a medium persona.',
    display: true,
  },
  '/experience': {
    prompt: ExperiencePrompt,
    description:
      'A guided introspective conversation in the style of a fortune teller \
      who explores what truly drives you — your motivations, values, and \
      the patterns woven into your life story.',
    display: true,
  },
  '/connection': {
    prompt: ConnectionFacilitatorPrompt,
    description:
      'Helps two or more people deepen their connection with each other. \
      Creates a safe space for vulnerability, empathy, and authentic sharing. \
      Perfect for couples, friends, family members, or anyone wanting to \
      understand each other better.',
    display: true,
    aliases: ['/connect', '/bonding'],
  },
  '/wakeUp': {
    prompt: WakeUpPrompt,
    description:
      'A morning check-in to set intentions for the day. Helps you connect with \
      your aspirations, clarify what matters most, and align with your highest \
      purpose as you begin your day.',
    display: true,
    aliases: ['/morning', '/morningRoutine'],
  },
};

/**
 * Resolve the PromptList command that a conversation is using, based on the
 * leading slash-command token of its first message (e.g. "/goal what is...").
 * Matches both canonical keys and aliases. Returns undefined when no command
 * is present.
 */
export function resolvePromptListItem(
  prompts: ChatCompletionMessageParam[] | undefined
): PromptListItem | undefined {
  const firstContent = prompts?.[0]?.content;
  if (typeof firstContent !== 'string') {
    return undefined;
  }
  const firstToken = firstContent.split(' ')[0];
  if (!firstToken) {
    return undefined;
  }
  if (firstToken in PromptList) {
    return PromptList[firstToken];
  }
  return Object.values(PromptList).find((x) => x.aliases?.includes(firstToken));
}
