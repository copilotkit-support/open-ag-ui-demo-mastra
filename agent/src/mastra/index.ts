import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql"; 
import { stockAnalysisAgent } from "./agents/stock-analysis-agent";
import { stockAnalysisWorkflow } from "./workflows/stock-analysis-workflow";

export const mastra = new Mastra({
  workflows: { stockAnalysisWorkflow },
  agents: { stockAnalysisAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
