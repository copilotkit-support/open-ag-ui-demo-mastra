import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const weatherTool = createTool({
  id: "get-weather-specific-activities",
  description:
    "Get weather-specific activities for a city based on current weather conditions",
  inputSchema: z.object({
    city: z.string().describe("The city to get activities for"),
  }),
  outputSchema: z.object({
    activities: z.array(z.string()),
  }),
  execute: async ({ context: { city }, mastra }) => {
    mastra?.getLogger()?.debug(`Tool executing for city: ${city}`);

    const workflow = mastra?.getWorkflow("weatherWorkflow");
    if (!workflow) {
      throw new Error("Weather workflow not found");
    }

    const run = workflow.createRun();
    const result = await run.start({
      inputData: {
        city: city,
      },
    });

    if (result.status === "success") {
      return {
        activities: result.result.activities,
      };
    }

    throw new Error(`Workflow execution failed: ${result.status}`);
  },
});
