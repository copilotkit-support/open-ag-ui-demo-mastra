import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const userQueryExtractionTool = createTool({
  id: "user-query-extraction-tool",
  description: "Extract information from user query",
  inputSchema: z.object({
    investmentDate: z.string(),
    tickers: z.array(z.string()),
    amount: z.array(z.number()),
    intervalOfInvestment: z.string()
  }),
  outputSchema: z.object({
    investmentDate: z.string().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc")
  }),
  execute: async ({ context: inputData }) => {
    return inputData;
  }
});
