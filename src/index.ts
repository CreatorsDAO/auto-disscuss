import { App } from "octokit";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { readFileSync } from "fs";
import { join } from "path";
import { generateText } from "./openai";
import { triggers } from "./config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// 读取私钥文件
const privateKey = readFileSync(
  join(__dirname, "../auto-disscuss.2024-12-16.private-key.pem"),
  "utf-8"
);

const app = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: privateKey,
});

// 获取指定组织的 installation ID
const installations = await app.octokit.request("GET /app/installations");
const installation = installations.data.find(
  (inst) => inst.account?.login === process.env.GITHUB_OWNER
);

if (!installation) {
  throw new Error(`未找到 ${process.env.GITHUB_OWNER} 组织的 installation`);
}

console.log(`📦 找到 installation ID: ${installation.id}`);

// 获取安装实例的 octokit
const octokit = await app.getInstallationOctokit(installation.id);

interface Discussion {
  id: string;
  title: string;
  body: string;
  number: number;
  url: string;
  updatedAt: string;
  comments: {
    nodes: Array<{
      body: string;
      author: {
        login: string;
      };
      createdAt: string;
    }>;
  };
}

class DiscussionMonitor {
  private lastCheckedTime: Date;
  private owner: string;
  private repo: string;
  private checkInterval: number;
  private pageSize: number;
  private pageCount: number;

  constructor() {
    this.lastCheckedTime = new Date();
    this.owner = process.env.GITHUB_OWNER || "";
    this.repo = process.env.GITHUB_REPO || "";
    this.checkInterval = parseInt(process.env.CHECK_INTERVAL || "60000");
    this.pageSize = 50;
    this.pageCount = 3; // 默认查询3页
    console.log(`🤖 监控机器人启动`);
    console.log(`📍 监控仓库: ${this.owner}/${this.repo}`);
    console.log(`⏱️  检查间隔: ${this.checkInterval}ms\n`);
    console.log(`📄 每页数量: ${this.pageSize}`);
    console.log(`📚 查询页数: ${this.pageCount}\n`);
  }

  async monitorDiscussions() {
    try {
      console.log(
        `[${new Date().toLocaleString()}] 开始检查最新discussions...`
      );
      let allDiscussions: Discussion[] = [];
      let hasNextPage = true;
      let cursor: string | null = null;
      let currentPage = 0;

      while (hasNextPage && currentPage < this.pageCount) {
        const query = `
          query($owner:String!, $repo:String!, $first:Int!, $after:String) {
            repository(owner:$owner, name:$repo) {
              discussions(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  title
                  body
                  number
                  url
                  updatedAt
                  comments(first: 100) {
                    nodes {
                      body
                      author {
                        login
                      }
                      createdAt
                    }
                  }
                }
              }
            }
          }
        `;

        const response: any = await octokit.graphql(query, {
          owner: this.owner,
          repo: this.repo,
          first: this.pageSize,
          after: cursor,
        });

        const { nodes, pageInfo } = response.repository.discussions;
        allDiscussions = allDiscussions.concat(nodes);
        hasNextPage = pageInfo.hasNextPage;
        cursor = pageInfo.endCursor;
        currentPage++;

        console.log(
          `✅ 获取第 ${currentPage}/${this.pageCount} 页，共 ${nodes.length} 条`
        );
      }

      console.log(`✅ 总共获取到 ${allDiscussions.length} 个discussions\n`);

      for (const discussion of allDiscussions) {
        console.log(
          `\n📝 处理discussion #${discussion.number}: ${discussion.title}`
        );
        await this.handleDiscussion(discussion);
      }
    } catch (error) {
      console.error("❌ 监控discussions时发生错误:", error);
    }

    // console.log(`\n⏳ ${this.checkInterval / 1000}秒后进行下一次检查...\n`);
    // setTimeout(() => this.monitorDiscussions(), this.checkInterval);
  }

  private async handleDiscussion(discussion: Discussion) {
    try {
      const response = await this.generateResponse(discussion);
      if (response) {
        console.log(`🤖 准备回复discussion #${discussion.number}`);
        await this.addComment(discussion.number, response);
      } else {
        console.log(`⏭️  跳过discussion #${discussion.number} (不需要回复)`);
      }
    } catch (error) {
      console.error(
        `❌ 处理discussion #${discussion.number}时发生错误:`,
        error
      );
    }
  }

  private async generateResponse(
    discussion: Discussion
  ): Promise<string | null> {
    // console.log("discussion", discussion.body);
    // 获取所有评论并按时间排序
    const comments = discussion.comments.nodes.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // console.log("comments", comments);

    // 获取第一条和最后一条评论
    const firstComment = comments[0];
    const lastComment = comments[comments.length - 1];

    // console.log("firstComment", firstComment);
    // console.log("lastComment", lastComment);

    // 如果最后一条是机器人的回复，直接跳过
    if (lastComment) {
      const botName = process.env.GITHUB_APP_BOT_NAME;
      if (lastComment.author.login === botName) {
        console.log(`⏭️ 跳过回复（上一条是机器人的回复）`);
        return null;
      }
    }

    if (lastComment) {
      const lastCommentBody = lastComment.body.toLowerCase();
      for (const trigger of triggers) {
        for (const word of trigger.words) {
          if (lastComment && lastCommentBody.includes(word)) {
            console.log(`need auto disscuss bot : with ${word}`);
            if (trigger.users.includes(lastComment.author.login)) {
              console.log(`trigger user: ${trigger.users}`);
              const response = await generateText({
                readme: discussion.body,
                template: trigger.template,
              });
              return response;
            }
          }
        }
      }
    }

    return null;
  }

  private async addComment(discussionNumber: number, body: string) {
    try {
      const query = `
        query($owner:String!, $repo:String!, $number:Int!) {
          repository(owner:$owner, name:$repo) {
            discussion(number:$number) {
              id
            }
          }
        }
      `;

      const response: any = await octokit.graphql(query, {
        owner: this.owner,
        repo: this.repo,
        number: discussionNumber,
      });

      const discussionId = response.repository.discussion.id;
      console.log(`📝 获取到discussion ID: ${discussionId}`);

      const mutationQuery = `
        mutation($body:String!, $discussionId:ID!) {
          addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
            comment {
              id
            }
          }
        }
      `;

      await octokit.graphql(mutationQuery, {
        discussionId: discussionId,
        body: body,
      });

      console.log(`✅ 成功回复discussion #${discussionNumber}`);
    } catch (error: any) {
      if (error.errors) {
        console.error(
          "❌ 添加回复时发生错误:",
          error.errors.map((e: any) => e.message).join(", ")
        );
      } else {
        console.error("❌ 添加回复时发生错误:", error);
      }
    }
  }
}

// 启动监控
const monitor = new DiscussionMonitor();
monitor.monitorDiscussions();
