/**
 * Tool Registration Entry Point
 *
 * Import this file (side-effect import) to register all tools into the global toolRegistry.
 * To add a new tool: create a new .tool.ts file and import it here.
 */

import { toolRegistry } from '../toolRegistry';
import removeFillersTool       from './remove_fillers.tool';
import cutSegmentTool          from './cut_segment.tool';
import removeSilenceTool       from './remove_silence.tool';
import removeBlackScreensTool  from './remove_black_screens.tool';
import addDubbingTool          from './add_dubbing.tool';

toolRegistry.register(removeFillersTool);
toolRegistry.register(cutSegmentTool);
toolRegistry.register(removeSilenceTool);
toolRegistry.register(removeBlackScreensTool);
toolRegistry.register(addDubbingTool);
