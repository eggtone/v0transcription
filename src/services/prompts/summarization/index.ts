/**
 * Summarization prompts index
 * 
 * This file exports all available summarization prompt templates
 * so they can be imported from a single location.
 */

// Define the prompt templates directly in this file to avoid import issues
export const conversationPrompt = `
这是一段关于Vivian老师和她的学生Anthony之间的对话，请提供一个全面而精确的总结，重点关注以下几个方面：

1. 讨论的核心主题和关键观点，特别是Anthony分享的个人经历、想法和感受
2. 对话中达成的任何决定或共识
3. 明确提出的行动项目和后续步骤
4. 重要的信息交换和知识点
5. 双方提到的未来计划或约定

请以清晰的结构呈现总结，按主题而非时间顺序组织内容，使用简洁明了的语言，确保包含所有重要细节但避免冗余。如有情感变化或重要的互动模式，也请简要提及。
`;

export const lecturePrompt = `
Summarize the following lecture/presentation.

Focus on:
- Main thesis or central idea
- Key concepts and theories introduced
- Important examples provided
- Supporting evidence or research cited
- Conclusions or takeaways
- Practical applications mentioned

Create a structured summary that captures the logical flow and main arguments.
`;

export const discussionPrompt = `
Summarize the following group discussion/panel with multiple speakers.

Focus on:
- Main topics discussed
- Different perspectives shared on each topic
- Points of agreement between participants
- Areas of disagreement or debate
- Conclusions or consensus reached
- Questions raised but not resolved
- Final thoughts or recommendations

Present the summary by topic, highlighting the diversity of viewpoints and any consensus.
`;

// Type for all available summarization prompt types
export type SummarizationStyle = 'conversation' | 'lecture' | 'discussion' | 'custom';

// Map of prompt types to their template strings
export const summarizationPrompts: Record<Exclude<SummarizationStyle, 'custom'>, string> = {
  conversation: conversationPrompt,
  lecture: lecturePrompt,
  discussion: discussionPrompt
};

/**
 * Get a prompt template by style name
 */
export function getPromptByStyle(style: SummarizationStyle, customPrompt?: string): string {
  if (style === 'custom') {
    if (!customPrompt) {
      throw new Error('Custom prompt is required when style is "custom"');
    }
    return customPrompt;
  }
  
  return summarizationPrompts[style];
} 