// curl https://api.red-pill.ai/v1/chat/completions \
//   -H "Content-Type: application/json" \
//   -H "Authorization: Bearer ........" \
//   -d '{
//   "model": "gpt-4o",
//   "messages": [
//     {"role": "user", "content": "What is the meaning of life?"}
//   ]
// }'

const renderTemplate = (
  template: string,
  state: Record<string, any>
): string => {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    // 处理嵌套属性路径，如 "user.name"
    const value = path.split(".").reduce((obj: any, key: string) => {
      return obj?.[key];
    }, state);

    // 处理 undefined 或 null 的情况
    if (value === undefined || value === null) {
      console.warn(`Warning: Template key "${path}" not found in state`);
      return match; // 保留原始模板标记
    }

    return String(value);
  });
};

export const generateText = async (state: {
  readme: string;
  template: string;
}) => {
  const content = renderTemplate(template, state);

  console.log("send : ", content);

  const response = await fetch("https://api.red-pill.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.REDPILL_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.MODEL,
      messages: [{ role: "user", content: content }],
    }),
  });

  console.log("response : ", response);

  const data = (await response.json()) as any;
  return data.choices[0].message.content;
};
