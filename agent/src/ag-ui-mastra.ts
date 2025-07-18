// Load environment variables from .env file
import "dotenv/config";
// Import Express.js framework and type definitions
import express, { Request, Response } from "express";
// Import AG-UI core types and schemas for input validation and event types
import {
  RunAgentInputSchema,
  RunAgentInput,
  EventType,
  Message,
} from "@ag-ui/core";
// Import event encoder for Server-Sent Events (SSE) formatting
import { EventEncoder } from "@ag-ui/encoder";
// Import UUID generator for creating unique message IDs
import { v4 as uuidv4 } from "uuid";
// Import the configured Mastra instance containing our weather agent
import { mastra } from "./mastra";

// Create Express application instance
const app = express();

// Enable JSON body parsing middleware for incoming requests
app.use(express.json());

// Define the main mastra-agent (Agent Workflow Protocol) endpoint
// This endpoint handles streaming communication with AG-UI agents
app.post("/mastra-agent", async (req: Request, res: Response) => {
  try {
    const input: RunAgentInput = RunAgentInputSchema.parse(req.body);

    res.setHeader("Content-Type", "text/event-stream"); // Enable SSE
    res.setHeader("Cache-Control", "no-cache"); // Prevent caching
    res.setHeader("Connection", "keep-alive"); // Keep connection open

    const encoder = new EventEncoder();

    const runStarted = {
      type: EventType.RUN_STARTED,
      threadId: input.threadId,
      runId: input.runId,
    };
    res.write(encoder.encode(runStarted));    // STEP 5: Initialize Agent State

    const stateSnapshot = {
      type: EventType.STATE_SNAPSHOT,
      snapshot: {
        availableCash: input.state?.availableCash || 100000,
        investmentSummary: input.state?.investmentSummary || {},
        investmentPortfolio: input.state?.investmentPortfolio || [],
        toolLogs: []
      },
    };
    res.write(encoder.encode(stateSnapshot));
    await new Promise((resolve) => setTimeout(resolve, 0));


    const stockAnalysis = mastra.getWorkflow('stockAnalysisWorkflow');

    function emitEvent(data: any) {
      res.write(encoder.encode(data));
    }
    const workflow = await stockAnalysis.createRunAsync();
    const result = await workflow.start({
      inputData: {
        messages: input.messages,
        availableCash: input.state?.availableCash || 1000000,
        emitEvent: emitEvent,
        investmentPortfolio: input.state?.investmentPortfolio || [],
        toolLogs: []
      }

    })

    emitEvent({
      type: EventType.STATE_DELTA,
      delta: [
        { op: "replace", path: "/toolLogs", value: [] }
      ]
    })
    await new Promise((resolve) => setTimeout(resolve, 0));
    const messageId = uuidv4();
    
    if (result?.status === "success" && result?.result?.result?.length > 0) {
      const toolcallStart = {
        type: EventType.TOOL_CALL_START,
        toolCallId: uuidv4(),
        toolCallName: "render_standard_charts_and_table",
      }
      emitEvent(toolcallStart);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const toolcallArgs = {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: toolcallStart.toolCallId,
        delta: JSON.stringify(result.result)
      }
      emitEvent(toolcallArgs);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const toolcallEnd = {
        type: EventType.TOOL_CALL_END,
        toolCallId: toolcallStart.toolCallId,
      }
      emitEvent(toolcallEnd);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    else {
      const textMessageStart = {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: "assistant",
      };
      res.write(encoder.encode(textMessageStart));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const response = result?.status === "success" ? result.result.textMessage : '';

      const chunkSize = 100; // Number of characters per chunk
      for (let i = 0; i < response.length; i += chunkSize) {
        const chunk = response.slice(i, i + chunkSize);

        const textMessageContent = {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: chunk,
        };
        res.write(encoder.encode(textMessageContent));

        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const textMessageEnd = {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      };
      res.write(encoder.encode(textMessageEnd));
    }


    // STEP 20: Finalize Agent Run
    // Send final event to indicate the entire agent run is complete
    const runFinished = {
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    };
    res.write(encoder.encode(runFinished));

    // STEP 21: Close SSE Connection
    // End the response stream to complete the HTTP request
    res.end();
  } catch (error) {
    // ERROR HANDLING SECTION
    // Handle any errors that occur during agent execution
    console.error("Error during streaming:", error);

    // Create an event encoder for error handling
    const encoder = new EventEncoder();

    // Check if HTTP headers have already been sent to the client
    if (!res.headersSent) {
      // CASE 1: Headers Not Sent Yet
      // We can still send a standard JSON error response
      res.status(422).json({ error: (error as Error).message });
    } else {
      // CASE 2: Headers Already Sent (SSE Stream Active)
      // We need to handle errors within the existing SSE stream
      try {
        // Re-parse request body to get thread/run IDs for error events
        const input: RunAgentInput = RunAgentInputSchema.parse(req.body);

        // STEP A: Update State to Reflect Error
        // Notify client that an error has occurred during processing
        const errorStateDelta = {
          type: EventType.STATE_DELTA,
          delta: [
            { op: "replace", path: "/status", value: "error" },
            {
              op: "replace",
              path: "/processingStage",
              value: "error_occurred",
            },
            { op: "add", path: "/error", value: (error as Error).message },
          ],
        };
        res.write(encoder.encode(errorStateDelta));

        // STEP B: Send Error Message as Text Message
        // Generate unique ID for the error message
        const errorMessageId = uuidv4();

        // Start error message stream
        const errorTextStart = {
          type: EventType.TEXT_MESSAGE_START,
          messageId: errorMessageId,
          role: "assistant",
        };
        res.write(encoder.encode(errorTextStart));

        // Send error content to user
        const errorContent = {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: errorMessageId,
          delta: `Error: ${(error as Error).message}`,
        };
        res.write(encoder.encode(errorContent));

        // End error message stream
        const errorTextEnd = {
          type: EventType.TEXT_MESSAGE_END,
          messageId: errorMessageId,
        };
        res.write(encoder.encode(errorTextEnd));

        // STEP C: Properly Terminate the Run
        // Send run finished event even in error case
        const runFinished = {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        };
        res.write(encoder.encode(runFinished));

        // Close the SSE stream
        res.send()
      } catch (writeError) {
        // CASE 3: Critical Error - Cannot Write to Stream
        // If we can't write error events, just log and close connection
        console.error("Failed to send error event:", writeError);
        if (!res.destroyed) {
          res.end();
        }
      }
    }
  }
});

// HELPER FUNCTION: Extract Location from User Message
// Analyzes user input to identify location mentions for weather queries
// Uses regex patterns to match common ways users specify locations
function extractLocationFromMessage(content: string): string | null {
  // Define regex patterns for different location mention formats
  // These patterns cover the most common ways users ask about weather
  const locationPatterns = [
    /weather in ([A-Za-z\s,]+)/i, // "weather in New York"
    /weather for ([A-Za-z\s,]+)/i, // "weather for Los Angeles"
    /([A-Za-z\s,]+) weather/i, // "Paris weather"
  ];

  // Iterate through each pattern to find location matches
  for (const pattern of locationPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      // Return the captured location, trimmed of whitespace
      return match[1].trim();
    }
  }

  // Return null if no location pattern is found
  return null;
}

// START EXPRESS SERVER
// Configure and start the HTTP server on port 8000
app.listen(8000, () => {
  console.log("Server running on http://localhost:8000");
  console.log("AG-UI endpoint available at http://localhost:8000/mastra-agent");
});
