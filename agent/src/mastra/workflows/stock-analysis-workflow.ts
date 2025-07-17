import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { STOCK_ANALYST_PROMPT } from "../prompts";
import yahooFinance from "yahoo-finance2";
import { userQueryExtractionTool } from "../tools/user-query-extraction-tool";

const llm = openai("gpt-4o-mini");

const agent = new Agent({
  name: "Stock Analysis Agent",
  model: llm,
  instructions: STOCK_ANALYST_PROMPT,
  tools: {
    userQueryExtractionTool : userQueryExtractionTool
  }
});


const fetchInformationFromUserQuery = createStep({
  id: "fetch-information-from-user-query",
  description: "Fetches information from user query",
  inputSchema: z.array(z.object({
    role: z.enum(["user", "system", "assistant"]).describe("The role of the message"),
    content: z.string().describe("The content of the message")
  })).describe("The user query"),
  outputSchema: z.object({
    investmentDate: z.date().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc")
  }),
  execute: async ({inputData}) => {
    try {
      const result = await agent.generate(inputData);
      return result.toolResults[0].result;
    } catch (error) {
      console.log(error);
      return {
        investmentDate: "",
        tickers: [],
        amount: [],
        intervalOfInvestment: ""
      }
    }

  }
});

const gatherStockInformation = createStep({
  id: "gather-stock-information",
  description: "Gathers stock information from yahoo finance",
  inputSchema: z.object({
    investmentDate: z.date().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc")
  }),
  outputSchema: z.object({
    investmentDate: z.date().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc")
  }),
  execute: async ({ inputData }) => {
    const { tickers, investmentDate, intervalOfInvestment } = inputData;
    const period1 = investmentDate;
    const period2 = new Date(); // or use a specific end date if needed

    const allowedIntervals = ["1d", "1wk", "1mo"] as const;
    const interval =
      allowedIntervals.includes(intervalOfInvestment as any)
        ? (intervalOfInvestment as typeof allowedIntervals[number])
        : "1d"; // fallback to "1d" if not allowed

    // Fetch historical data for all tickers in parallel
    const stockData = await Promise.all(
      tickers.map(ticker =>
        yahooFinance.historical(ticker, {
          period1,
          period2,
          interval,
          events: "history"
        })
      )
    );

    // stockData will be an array of arrays, each containing the historical data for a ticker
    // You can map it to an object if you want: { [ticker]: data }
    // const stockDataByTicker = Object.fromEntries(tickers.map((t, i) => [t, stockData[i]]));

    // Now stockData contains all the closing periods for each ticker
    // You can return or process it as needed
    return inputData
  }
});

const stockAnalysisWorkflow = createWorkflow({
  id: "stock-analysis-workflow",
  inputSchema: z.array(z.object({
    role: z.enum(["user", "system", "assistant"]).describe("The role of the message"),
    content: z.string().describe("The content of the message")
  })).describe("The user query"),
  outputSchema: z.object({
    investmentDate: z.date().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc")
  }),
})
  .then(fetchInformationFromUserQuery)
  .then(gatherStockInformation);

stockAnalysisWorkflow.commit();
stockAnalysisWorkflow.createRun();

export { stockAnalysisWorkflow };
