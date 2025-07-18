// import { openai } from "@ai-sdk/openai";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { STOCK_ANALYST_PROMPT } from "../prompts";
import yahooFinance from "yahoo-finance2";
import OpenAI from "openai";
import { userQueryExtractionTool } from "../tools/user-query-extraction-tool";
import { gatherInsightsTool } from "../tools/gather-insights-tool";
import { EventType } from "@ag-ui/core";


const fetchInformationFromUserQuery = createStep({
  id: "fetch-information-from-user-query",
  description: "Fetches information from user query",
  inputSchema: z.object({
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    messages: z.any(),
    availableCash: z.number().describe("The available cash of the user"),
    emitEvent: z.function().input(z.any()).output(z.any()),
    investmentPortfolio: z.array(z.object({
      ticker: z.string(),
      amount: z.number()
    })).describe("The investment portfolio of the user")
  }),
  outputSchema: z.object({
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    emitEvent: z.function(),
    investmentDate: z.string().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc"),
    benchmarkTicker: z.string().describe("The benchmark ticker to compare with"),
    skip: z.boolean().describe("Whether to skip this step"),
    textMessage: z.string().describe("The text message to display to the user")
  }),
  execute: async ({ inputData }) => {
    try {
      let data = inputData;
      await new Promise(resolve => setTimeout(resolve, 0));
      data.messages[0].content = STOCK_ANALYST_PROMPT.replace("{portfolioDataContext}", JSON.stringify(inputData.investmentPortfolio));
      if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
        inputData.emitEvent({
          type: EventType.STATE_DELTA,
          delta: [
            {
              op: "add", path: "/toolLogs/-", value: {
                message: "Fetching information from user query",
                status: "processing"
              }
            }
          ]
        });
        inputData.toolLogs.push({
          message: "Fetching information from user query",
          status: "processing"
        })
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      data.messages = data.messages.map((msg: any) => {
        if (msg?.content == null || msg?.content == undefined) {
          return {
            ...msg,
            tool_calls: msg.toolCalls,
            content: ''
          }
        }
        if (msg?.role === 'tool') {
          return {
            ...msg,
            tool_call_id: msg.toolCallId
          }
        }
        return msg
      });
      const model = new OpenAI()
      const response = await model.chat.completions.create({
        model: "gpt-4o-mini",
        messages: data.messages,
        tools: [userQueryExtractionTool as any],
        tool_choice: "auto"
      })
      if (response.choices[0].finish_reason == 'stop') {
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          let index = inputData.toolLogs.length - 1;
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "replace", path: `/toolLogs/${index}/status`, value: "completed"
              }
            ]
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return {
          skip: true,
          availableCash: inputData.availableCash,
          emitEvent: inputData.emitEvent,
          textMessage: response.choices[0].message.content
        }
      }
      else {
        let toolResult
        if (typeof response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments === "string") {
          toolResult = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        }
        else {
          toolResult = response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || {};
        }
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          let index = inputData.toolLogs.length - 1;
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "replace", path: `/toolLogs/${index}/status`, value: "completed"
              }
            ]
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return {
          ...toolResult,
          skip: false,
          availableCash: inputData.availableCash,
          emitEvent: inputData.emitEvent,
          textMessage: '',
          toolLogs: inputData.toolLogs
        }
      }

    } catch (error) {
      console.log(error);
      throw error
    }
  }
});

const gatherStockInformation = createStep({
  id: "gather-stock-information",
  description: "Gathers stock information from yahoo finance",
  inputSchema: z.object({
    skip: z.boolean().describe("Whether to skip this step"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    textMessage: z.string().describe("The text message to display to the user"),
    investmentDate: z.string().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc"),
    availableCash: z.number().describe("The available cash of the user"),
    emitEvent: z.function(),
    benchmarkTicker: z.string().describe("The benchmark ticker to compare with")
  }),
  outputSchema: z.object({
    skip: z.boolean().describe("Whether to skip this step"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    textMessage: z.string().describe("The text message to display to the user"),
    investmentDate: z.string().describe("The date of investment from which user wants to invest"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    amount: z.array(z.number()).describe("The amount of money to invest in each ticker or stock"),
    intervalOfInvestment: z.string().describe("The interval of investment. Mostly user doesnt provide it. AI needs to figure this one out. If the investment date is long assume the interval as '6mo' or '3mo'. If investment date is relatively less assume interval as '1mo' or '1wk' or '3d', etc"),
    availableCash: z.number().describe("The available cash of the user"),
    preparedStockData: z.array(z.object({
      ticker: z.string(),
      data: z.array(z.object({
        date: z.string(),
        close: z.number(),
      }))
    })),
    benchmarkData: z.object({
      ticker: z.string(),
      data: z.array(z.object({
        date: z.string(),
        close: z.number(),
      }))
    })
  }),
  execute: async ({ inputData }) => {
    // if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
    //   inputData.emitEvent({
    //     type: EventType.STATE_DELTA,
    //     delta: [
    //       { op: "replace", path: "/available_cash", value: 99 }
    //     ]
    //   });
    //   await new Promise(resolve => setTimeout(resolve, 0));
    // }
    try {
      if (!inputData.skip) {
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "add", path: "/toolLogs/-", value: {
                  message: "Fetching stock data",
                  status: "processing"
                }
              }
            ]
          });
          inputData.toolLogs.push({
            message: "Fetching stock data",
            status: "processing"
          })
          await new Promise(resolve => setTimeout(resolve, 2));
        }
        const { tickers, investmentDate, intervalOfInvestment } = inputData;
        const period1 = investmentDate;
        const period2 = new Date(); // or use a specific end date if needed

        const allowedIntervals = ["1d", "1wk", "1mo"] as const;
        const interval =
          allowedIntervals.includes(intervalOfInvestment as any)
            ? (intervalOfInvestment as typeof allowedIntervals[number])
            : "1mo"; // fallback to "1d" if not allowed

        // Fetch historical data for all tickers in parallel
        const stockData = await Promise.all(
          tickers.map(async (ticker: string) => {
            return {
              ticker,
              data: await yahooFinance.historical(ticker, {
                period1,
                period2,
                interval: interval as any,
                events: "history"
              })
            }
          }
          )
        );

        // Fetch benchmark data
        const benchmarkData = await yahooFinance.historical(inputData.benchmarkTicker, {
          period1,
          period2,
          interval: interval as any,
          events: "history"
        });

        const preparedStockData = stockData.map((item: any) => {
          return {
            ticker: item.ticker,
            data: item.data.map((item: any) => {
              return {
                date: item?.date,
                close: parseInt(String(item?.close ?? "0")),
              }
            })
          }
        });

        const preparedBenchmarkData = {
          ticker: inputData.benchmarkTicker,
          data: benchmarkData.map((item: any) => {
            return {
              date: item?.date,
              close: parseInt(String(item?.close ?? "0")),
            }
          })
        };
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          let index = inputData.toolLogs.length - 1;
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "replace", path: `/toolLogs/${index}/status`, value: "completed"
              }
            ]
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return {
          ...inputData,
          preparedStockData,
          benchmarkData: preparedBenchmarkData,
        }
      }
      else {
        return {
          ...inputData,
          skip: true,
          preparedStockData: [],
          benchmarkData: {
            ticker: inputData.benchmarkTicker,
            data: []
          }
        }
      }
    } catch (error) {
      console.log(error);
      throw error
    }
  }
});

const calculateInvestmentReturns = createStep({
  id: "calculate-investment-returns",
  description: "Calculates investment returns for each ticker over time and validates available cash.",
  inputSchema: z.object({
    skip: z.boolean().describe("Whether to skip this step"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    textMessage: z.string().describe("The text message to display to the user"),
    investmentDate: z.string(),
    emitEvent: z.function(),
    tickers: z.array(z.string()),
    amount: z.array(z.number()),
    intervalOfInvestment: z.string(),
    availableCash: z.number(),
    preparedStockData: z.array(z.object({
      ticker: z.string(),
      data: z.array(z.object({
        date: z.string(),
        close: z.number(),
      }))
    })),
    benchmarkData: z.object({
      ticker: z.string(),
      data: z.array(z.object({
        date: z.string(),
        close: z.number(),
      }))
    })
  }),
  outputSchema: z.object({
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    skip: z.boolean().describe("Whether to skip this step"),
    availableCash: z.number().describe("Available cash after investments"),
    result: z.array(z.object({
      date: z.string().describe("The date"),
      portfolioValue: z.number().describe("Portfolio value at the time"),
      benchmarkValue: z.number().describe("Benchmark value at the time")
    })),
    totalReturns: z.array(z.object({
      ticker: z.string().describe("The ticker value"),
      rets: z.number().describe("The total returns from the ticker")
    })),
    allocations: z.array(z.object({
      ticker: z.string().describe("The ticker data"),
      percentOfAllocation: z.number().describe("Percentage of allocation this ticker has"),
      value: z.number().describe("Current value of ticker in the portfolio"),
      returnPercent: z.number().describe("Percentage of return from this ticker")
    })),
    emitEvent: z.function()
  }),
  execute: async ({ inputData }) => {
    try {
      if (!inputData.skip) {
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "add", path: "/toolLogs/-", value: {
                  message: "Calculating investment returns",
                  status: "processing"
                }
              }
            ]
          });
          inputData.toolLogs.push({
            message: "Calculating investment returns",
            status: "processing"
          })
          await new Promise(resolve => setTimeout(resolve, 2));
        }
        const { tickers, amount, availableCash, investmentDate, preparedStockData, benchmarkData } = inputData;
        // Validate available cash
        const totalInvestment = amount.reduce((a, b) => a + b, 0);
        if (totalInvestment > availableCash) {
          throw new Error(`Not enough available cash. Required: ${totalInvestment}, Available: ${availableCash}`);
        }
        // Calculate shares bought for each ticker (whole shares only)
        const sharesByTicker: Record<string, number> = {};
        let actualTotalInvestment = 0;
        preparedStockData.forEach((stock, idx) => {
          const investAmount = amount[idx];
          const priceEntry = stock.data.find(d => new Date(d.date) >= new Date(investmentDate)) || stock.data[0];
          const closePrice = priceEntry?.close || 0;
          const shares = closePrice > 0 ? Math.floor(investAmount / closePrice) : 0;
          sharesByTicker[stock.ticker] = shares;
          actualTotalInvestment += shares * closePrice; // Actual amount spent
        });

        // Calculate benchmark shares (if actual investment was put in benchmark)
        const benchmarkPriceAtInvestment = benchmarkData.data.find(d => new Date(d.date) >= new Date(investmentDate)) || benchmarkData.data[0];
        const benchmarkShares = benchmarkPriceAtInvestment?.close > 0 ? Math.floor(actualTotalInvestment / benchmarkPriceAtInvestment.close) : 0;

        // Build a date-indexed map for all tickers
        const allDates = Array.from(new Set(preparedStockData.flatMap(stock => stock.data.map(d => d.date))
          .concat(benchmarkData.data.map(d => d.date)))).sort();
        // Calculate portfolio value and benchmark value for each date
        const result = allDates.map(date => {
          // Portfolio value: sum of shares * close for each ticker on this date
          let portfolioValue = 0;
          let hasPortfolioData = false;
          preparedStockData.forEach(stock => {
            const priceEntry = stock.data.find(d => new Date(d.date).toLocaleDateString() == new Date(date).toLocaleDateString());
            if (priceEntry) {
              portfolioValue += sharesByTicker[stock.ticker] * priceEntry.close;
              hasPortfolioData = true;
            }
          });
          // Benchmark value: benchmark shares * current benchmark price
          const benchmarkEntry = benchmarkData.data.find(d => new Date(d.date).toLocaleDateString() == new Date(date).toLocaleDateString());
          const benchmarkValue = benchmarkEntry ? benchmarkShares * benchmarkEntry.close : 0;
          const hasBenchmarkData = !!benchmarkEntry;

          // Only include dates where both portfolio and benchmark have data
          if (hasPortfolioData && hasBenchmarkData) {
            return { date: new Date(date).toLocaleDateString(), portfolioValue, benchmarkValue };
          }
          return null;
        }).filter((item): item is { date: string; portfolioValue: number; benchmarkValue: number } => item !== null); // Remove null entries
        // Calculate total returns for each ticker (as percentage)
        const totalReturns = preparedStockData.map((stock, idx) => {
          const investAmount = amount[idx];
          const firstEntry = stock.data.find(d => new Date(d.date) >= new Date(investmentDate)) || stock.data[0];
          const lastEntry = stock.data[stock.data.length - 1];
          const shares = sharesByTicker[stock.ticker];
          const finalValue = shares * lastEntry.close;
          const rets = investAmount > 0 ? ((finalValue - investAmount) / investAmount) * 100 : 0; // Return as percentage
          return { ticker: stock.ticker, rets };
        });
        // Calculate allocations
        const allocations = preparedStockData.map((stock, idx) => {
          const investAmount = amount[idx];
          const shares = sharesByTicker[stock.ticker];
          const lastEntry = stock.data[stock.data.length - 1];
          const value = shares * lastEntry.close;
          const percentOfAllocation = actualTotalInvestment > 0 ? (shares * (stock.data[0]?.close || 0)) / actualTotalInvestment * 100 : 0;
          const returnPercent = investAmount > 0 ? ((value - investAmount) / investAmount) * 100 : 0;
          return {
            ticker: stock.ticker,
            percentOfAllocation,
            value,
            returnPercent
          };
        });
        // Calculate available cash after investments
        const finalAvailableCash = availableCash - actualTotalInvestment;
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          let index = inputData.toolLogs.length - 1;
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "replace", path: `/toolLogs/${index}/status`, value: "completed"
              }
            ]
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return {
          tickers,
          skip: false,
          availableCash: finalAvailableCash,
          result,
          totalReturns,
          allocations,
          toolLogs: inputData.toolLogs,
          emitEvent: inputData.emitEvent
        };
      }
      else {
        return {
          ...inputData,
          skip: true,
          result: [],
          totalReturns: [],
          allocations: [],
          emitEvent: inputData.emitEvent
        }
      }
    } catch (error) {
      console.log(error);
      throw error
    }
  }
});

const gatherInsights = createStep({
  id: "gather-insights",
  description: "Gathers insights from the investment returns",
  inputSchema: z.object({
    skip: z.boolean().describe("Whether to skip this step"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    textMessage: z.string().describe("The text message to display to the user"),
    tickers: z.array(z.string()).describe("The array of tickers or stocks that user wants to invest in"),
    availableCash: z.number().describe("Available cash after investments"),
    result: z.array(z.object({
      date: z.string().describe("The date"),
      portfolioValue: z.number().describe("Portfolio value at the time"),
      benchmarkValue: z.number().describe("Benchmark value at the time")
    })),
    totalReturns: z.array(z.object({
      ticker: z.string().describe("The ticker value"),
      rets: z.number().describe("The total returns from the ticker")
    })),
    allocations: z.array(z.object({
      ticker: z.string().describe("The ticker data"),
      percentOfAllocation: z.number().describe("Percentage of allocation this ticker has"),
      value: z.number().describe("Current value of ticker in the portfolio"),
      returnPercent: z.number().describe("Percentage of return from this ticker")
    })),
    emitEvent: z.function()
  }),
  outputSchema: z.object({
    skip: z.boolean().describe("Whether to skip this step"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    textMessage: z.string().describe("The text message to display to the user"),
    availableCash: z.number().describe("Available cash after investments"),
    result: z.array(z.object({
      date: z.string().describe("The date"),
      portfolioValue: z.number().describe("Portfolio value at the time"),
      benchmarkValue: z.number().describe("Benchmark value at the time")
    })),
    totalReturns: z.array(z.object({
      ticker: z.string().describe("The ticker value"),
      rets: z.number().describe("The total returns from the ticker")
    })),
    allocations: z.array(z.object({
      ticker: z.string().describe("The ticker data"),
      percentOfAllocation: z.number().describe("Percentage of allocation this ticker has"),
      value: z.number().describe("Current value of ticker in the portfolio"),
      returnPercent: z.number().describe("Percentage of return from this ticker")
    })),
    bullInsights: z.array(z.object({
      title: z.string().describe("The title of the insight"),
      description: z.string().describe("The description of the insight"),
      emoji: z.string().describe("The emoji of the insight")
    })),
    bearInsights: z.array(z.object({
      title: z.string().describe("The title of the insight"),
      description: z.string().describe("The description of the insight"),
      emoji: z.string().describe("The emoji of the insight")
    })),
    emitEvent: z.function()
  }),
  execute: async ({ inputData }) => {
    try {
      if (!inputData.skip) {
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "add", path: "/toolLogs/-", value: {
                  message: "Generating insights",
                  status: "processing"
                }
              }
            ]
          });
          inputData.toolLogs.push({
            message: "Generating insights",
            status: "processing"
          })
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        const model = new OpenAI()
        const response = await model.chat.completions.create({
          model: "gpt-4o-mini",
          tools: [gatherInsightsTool as any],
          tool_choice: "required",
          messages: [
            { role: "system", content: `You are a helpful assistant that generates insights for the tickers that user provides. Only one tool call is allowed. Within the same tool call, you can generate both bull and bear insights. You can generate as many insights as you want. But you can STRICTLY only generate one tool call. You can have insights for multiple tickers in the same tool call. Make sure there should be 2 bull and 2 bear for each ticker.` },
            { role: "user", content: `Generate insights for the following tickers: ${inputData.tickers.join(", ")}` }
          ]
        })
        let toolResult
        if (typeof response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments === "string") {
          toolResult = JSON.parse(response.choices[0].message.tool_calls[0].function.arguments);
        }
        else {
          toolResult = response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || {};
        }
        if (inputData?.emitEvent && typeof inputData.emitEvent === "function") {
          let index = inputData.toolLogs.length - 1;
          inputData.emitEvent({
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: "replace", path: `/toolLogs/${index}/status`, value: "completed"
              }
            ]
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return {
          ...inputData,
          ...toolResult
        }
      }
      else {
        return {
          ...inputData
        }
      }
    } catch (error) {
      console.log(error);
      throw error
    }

  }
})

const stockAnalysisWorkflow = createWorkflow({
  id: "stock-analysis-workflow",
  inputSchema: z.object({
    messages: z.any(),
    availableCash: z.number().describe("The available cash of the user"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    emitEvent: z.function().input(z.any()).output(z.any()),
    investmentPortfolio: z.array(z.object({
      ticker: z.string(),
      amount: z.number()
    })).describe("The investment portfolio of the user")
  }),
  outputSchema: z.object({
    skip: z.boolean().describe("Whether to skip this step"),
    textMessage: z.string().describe("The text message to display to the user"),
    toolLogs: z.array(z.object({
      message: z.string().describe("The message to display to the user"),
      status: z.string().describe("The status of the message")
    })).describe("The tool logs of the workflow"),
    availableCash: z.number().describe("Available cash after investments"),
    result: z.array(z.object({
      date: z.string().describe("The date"),
      portfolioValue: z.number().describe("Portfolio value at the time"),
      benchmarkValue: z.number().describe("Benchmark value at the time")
    })),
    totalReturns: z.array(z.object({
      ticker: z.string().describe("The ticker value"),
      rets: z.number().describe("The total returns from the ticker")
    })),
    allocations: z.array(z.object({
      ticker: z.string().describe("The ticker data"),
      percentOfAllocation: z.number().describe("Percentage of allocation this ticker has"),
      value: z.number().describe("Current value of ticker in the portfolio"),
      returnPercent: z.number().describe("Percentage of return from this ticker")
    })),
    bullInsights: z.array(z.object({
      title: z.string().describe("The title of the insight"),
      description: z.string().describe("The description of the insight"),
      emoji: z.string().describe("The emoji of the insight")
    })),
    bearInsights: z.array(z.object({
      title: z.string().describe("The title of the insight"),
      description: z.string().describe("The description of the insight"),
      emoji: z.string().describe("The emoji of the insight")
    }))
  }),
})
  .then(fetchInformationFromUserQuery)
  .then(gatherStockInformation)
  .then(calculateInvestmentReturns)
  .then(gatherInsights);

stockAnalysisWorkflow.commit();
stockAnalysisWorkflow.createRun();

export { stockAnalysisWorkflow };
