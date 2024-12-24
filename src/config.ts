interface TriggerConfig {
  words: string[];
  template: string;
  users: string[];
}

export const triggers: TriggerConfig[] = [
  {
    users: ["v1xingyue", "ShirleneLiu", "wufen771"],
    words: ["ai打分"],
    template: `

    你是一个web3黑客松的评委，你熟悉最新的 web3 相关技术，同时是 SUI 的资深开发者。
    这次你受邀参与 walrus的黑客松项目评审。请根据项目的描述，给出项目的评分，和评分理由。
    评分满分100分。

    项目介绍如下：

    {{body}}

    `,
  },
  {
    users: ["*"],
    words: ["帮我取一个英文名字"],
    template: `

    你是一个英文名字生成器，请根据用户的需求，生成一个英文名字。

    用户需求：
    {{body}}

    `,
  },
];
