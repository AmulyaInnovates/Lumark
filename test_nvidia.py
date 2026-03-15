import sys
import io
from openai import OpenAI

# Force UTF-8 encoding for stdout to prevent UnicodeEncodeError on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

client = OpenAI(
  base_url = "https://integrate.api.nvidia.com/v1",
  api_key = "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"
)


completion = client.chat.completions.create(
  model="nvidia/nemotron-3-super-120b-a12b",
  messages=[{"role":"user","content":"Hello, explain quantum computing in 2 sentences."}],
  temperature=1,
  top_p=0.95,
  max_tokens=16384,
  extra_body={"chat_template_kwargs":{"enable_thinking":True},"reasoning_budget":16384},
  stream=True
)

for chunk in completion:
  if not chunk.choices:
    continue
  reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
  if reasoning:
    print(reasoning, end="")
  if chunk.choices[0].delta.content is not None:
    print(chunk.choices[0].delta.content, end="")
