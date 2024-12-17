// curl https://api.red-pill.ai/v1/chat/completions \
//   -H "Content-Type: application/json" \
//   -H "Authorization: Bearer ........" \
//   -d '{
//   "model": "gpt-4o",
//   "messages": [
//     {"role": "user", "content": "What is the meaning of life?"}
//   ]
// }'

export const generateText = async (readme: string) => {
  const content = `

  你是一个web3黑客松的评委，你熟悉最新的 web3 相关技术，同时是 SUI 的资深开发者。
  这次你受邀参与 walrus的黑客松项目评审。请根据项目的描述，给出项目的评分，和评分理由。
  评分满分100分。

项目介绍如下：

${readme}
  `;

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
