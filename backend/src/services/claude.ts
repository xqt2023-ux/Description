import Anthropic from '@anthropic-ai/sdk';

// Lazy initialization of Claude client
let claudeClient: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (!claudeClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured. Please set it in backend/.env file');
    }
    claudeClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return claudeClient;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeSkillResult {
  success: boolean;
  result?: string;
  error?: string;
}

// General chat with Claude
export async function chatWithClaude(
  messages: ClaudeMessage[],
  systemPrompt?: string
): Promise<string> {
  const client = getClaudeClient();
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt || 'You are a helpful AI assistant for video editing. Help users edit their videos, transcripts, and media content.',
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textContent = response.content.find(c => c.type === 'text');
  return textContent ? textContent.text : '';
}

// Remove filler words from transcript
export async function removeFillerWords(transcript: string): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are a transcript editor. Remove filler words (um, uh, like, you know, so, actually, basically, literally, right, I mean, kind of, sort of) from the transcript while maintaining natural flow and meaning. Return ONLY the cleaned transcript, no explanations.',
      messages: [{
        role: 'user',
        content: `Please remove filler words from this transcript:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : transcript,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to process transcript',
    };
  }
}

// Generate summary of video content
export async function generateSummary(transcript: string): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are a content summarizer. Create a concise, engaging summary of the video content based on the transcript. Include key points and main topics discussed.',
      messages: [{
        role: 'user',
        content: `Please summarize this video transcript:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : '',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate summary',
    };
  }
}

// Generate show notes
export async function generateShowNotes(transcript: string): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are a content creator assistant. Generate professional show notes from the transcript, including: title suggestions, key topics with timestamps placeholders, main takeaways, and relevant links/resources to explore.',
      messages: [{
        role: 'user',
        content: `Please generate show notes for this video transcript:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : '',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate show notes',
    };
  }
}

// Generate social media posts
export async function generateSocialPosts(transcript: string, platform: string = 'twitter'): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const platformGuides: Record<string, string> = {
      twitter: 'Create 3 engaging tweet options (max 280 chars each) with relevant hashtags',
      linkedin: 'Create a professional LinkedIn post with key insights and a call to action',
      instagram: 'Create an Instagram caption with emojis and relevant hashtags',
      youtube: 'Create an engaging YouTube description with timestamps placeholder and tags',
    };
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a social media expert. ${platformGuides[platform] || platformGuides.twitter}`,
      messages: [{
        role: 'user',
        content: `Based on this video transcript, create social media content:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : '',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate social posts',
    };
  }
}

// Find sections to cut (silence, repetition, mistakes)
export async function suggestCuts(transcript: string): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are a video editor assistant. Analyze the transcript and identify sections that could be cut: repetitive content, off-topic tangents, false starts, or unclear segments. Format as a list with the text to cut and reason why.',
      messages: [{
        role: 'user',
        content: `Please analyze this transcript and suggest what to cut:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : '',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to analyze transcript',
    };
  }
}

// Translate transcript
export async function translateTranscript(transcript: string, targetLanguage: string): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are a professional translator. Translate the content accurately while maintaining the natural speaking style. Target language: ${targetLanguage}. Return ONLY the translation.`,
      messages: [{
        role: 'user',
        content: `Please translate this transcript to ${targetLanguage}:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : '',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to translate',
    };
  }
}

// Generate chapters/timestamps
export async function generateChapters(transcript: string): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are a video editor. Analyze the transcript and suggest chapter markers with titles. Format as: [Timestamp placeholder] - Chapter Title. Group related content into logical chapters.',
      messages: [{
        role: 'user',
        content: `Please generate chapter markers for this video transcript:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : '',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to generate chapters',
    };
  }
}

// Improve/rewrite transcript for clarity
export async function improveTranscript(transcript: string): Promise<ClaudeSkillResult> {
  try {
    const client = getClaudeClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are a professional editor. Improve the transcript for clarity and readability: fix grammar, improve sentence structure, and make it more professional while keeping the original meaning and voice. Return ONLY the improved transcript.',
      messages: [{
        role: 'user',
        content: `Please improve this transcript for clarity:\n\n${transcript}`,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    return {
      success: true,
      result: textContent ? textContent.text : '',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to improve transcript',
    };
  }
}

// Task planning types
export interface EditTask {
  id: string;
  type: 'remove-filler' | 'translate' | 'summarize' | 'cut' | 'trim' | 'caption' | 'improve' | 'chapters' | 'social' | 'show-notes' | 'custom';
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  params?: Record<string, any>;
  result?: string;
  error?: string;
}

export interface EditPlan {
  success: boolean;
  userIntent: string;
  tasks: EditTask[];
  summary: string;
  error?: string;
}

// AI-powered edit task planner - analyzes user request and breaks it into actionable tasks
export async function planEditTasks(
  userRequest: string, 
  context: { 
    hasTranscript: boolean; 
    transcript?: string;
    mediaType?: 'video' | 'audio';
    duration?: number;
  }
): Promise<EditPlan> {
  try {
    const client = getClaudeClient();
    
    const availableTasks = [
      { type: 'remove-filler', name: 'Remove Filler Words', description: 'Remove um, uh, like, you know' },
      { type: 'translate', name: 'Translate', description: 'Translate to another language (requires targetLanguage param)' },
      { type: 'summarize', name: 'Generate Summary', description: 'Create a summary of the content' },
      { type: 'cut', name: 'Suggest Cuts', description: 'Find parts to remove (repetitions, tangents)' },
      { type: 'trim', name: 'Trim Silence', description: 'Remove silent parts' },
      { type: 'caption', name: 'Generate Captions', description: 'Create subtitles/captions' },
      { type: 'improve', name: 'Improve Transcript', description: 'Fix grammar and improve clarity' },
      { type: 'chapters', name: 'Generate Chapters', description: 'Create chapter markers' },
      { type: 'social', name: 'Social Media Posts', description: 'Generate social media content (requires platform param)' },
      { type: 'show-notes', name: 'Show Notes', description: 'Generate show notes' },
    ];

    const systemPrompt = `You are an AI video editor assistant. Your job is to understand the user's editing request and break it down into specific actionable tasks.

Available tasks:
${availableTasks.map(t => `- ${t.type}: ${t.name} - ${t.description}`).join('\n')}

Context:
- Has transcript: ${context.hasTranscript}
- Media type: ${context.mediaType || 'unknown'}
- Duration: ${context.duration ? `${context.duration} seconds` : 'unknown'}

IMPORTANT: Respond with a valid JSON object only, no markdown code blocks, no additional text.
The JSON must have this exact structure:
{
  "userIntent": "Brief summary of what user wants",
  "tasks": [
    {
      "id": "task-1",
      "type": "one of the available task types",
      "name": "Human readable name",
      "description": "What this task will do",
      "status": "pending",
      "params": {}
    }
  ],
  "summary": "Overall plan explanation for the user"
}

For translation tasks, include targetLanguage in params.
For social media tasks, include platform (twitter/linkedin/instagram/youtube) in params.
Order tasks logically (e.g., transcribe before translate if no transcript exists).`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userRequest,
      }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent) {
      return {
        success: false,
        userIntent: userRequest,
        tasks: [],
        summary: '',
        error: 'No response from AI',
      };
    }

    // Parse the JSON response
    let planData;
    try {
      // Clean up response - remove any markdown code blocks if present
      let jsonStr = textContent.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }
      planData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI plan response:', textContent.text);
      return {
        success: false,
        userIntent: userRequest,
        tasks: [],
        summary: '',
        error: 'Failed to parse AI response',
      };
    }

    return {
      success: true,
      userIntent: planData.userIntent || userRequest,
      tasks: planData.tasks || [],
      summary: planData.summary || '',
    };
  } catch (error: any) {
    console.error('Plan edit tasks error:', error);
    return {
      success: false,
      userIntent: userRequest,
      tasks: [],
      summary: '',
      error: error.message || 'Failed to plan edit tasks',
    };
  }
}

// Execute a single edit task
export async function executeEditTask(
  task: EditTask,
  transcript: string
): Promise<{ success: boolean; result?: string; error?: string }> {
  switch (task.type) {
    case 'remove-filler':
      return removeFillerWords(transcript);
    case 'translate':
      return translateTranscript(transcript, task.params?.targetLanguage || 'English');
    case 'summarize':
      return generateSummary(transcript);
    case 'cut':
      return suggestCuts(transcript);
    case 'improve':
      return improveTranscript(transcript);
    case 'chapters':
      return generateChapters(transcript);
    case 'social':
      return generateSocialPosts(transcript, task.params?.platform || 'twitter');
    case 'show-notes':
      return generateShowNotes(transcript);
    case 'caption':
      // Captions would use the transcript directly
      return { success: true, result: transcript };
    case 'trim':
      // Trim silence is a video processing task, not transcript-based
      return { success: true, result: 'Silence trimming requires video processing' };
    default:
      return { success: false, error: `Unknown task type: ${task.type}` };
  }
}

