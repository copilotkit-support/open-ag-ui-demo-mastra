import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { STOCK_ANALYST_PROMPT } from "../prompts";
import { stockAnalysisWorkflow } from "../workflows/stock-analysis-workflow";

export const stockAnalysisAgent = new Agent({
  name: "stockAnalysisAgent",
  model: openai("gpt-4o-mini"),
  instructions: STOCK_ANALYST_PROMPT,
  workflows({ runtimeContext }) {
      return {
        stockAnalysisWorkflow : stockAnalysisWorkflow
      }
  },
});
