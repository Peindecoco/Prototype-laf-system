<html>
<head></head>
<body>
import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-5.2",
  input: "Write a short bedtime story about a unicorn.",
});

console.log(response.output_text);
</body>
</html>
