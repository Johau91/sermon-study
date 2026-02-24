import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const allMessages = await ctx.db.query("chatMessages").order("desc").take(5000);

    // Group by sessionId
    const sessionMap = new Map<
      string,
      {
        sessionId: string;
        lastMessageAt: number;
        messageCount: number;
        title: string;
      }
    >();

    for (const msg of allMessages) {
      const existing = sessionMap.get(msg.sessionId);
      if (existing) {
        existing.messageCount++;
        if (msg._creationTime > existing.lastMessageAt) {
          existing.lastMessageAt = msg._creationTime;
        }
        if (msg.role === "user") {
          existing.title = msg.content;
        }
      } else {
        sessionMap.set(msg.sessionId, {
          sessionId: msg.sessionId,
          lastMessageAt: msg._creationTime,
          messageCount: 1,
          title: msg.role === "user" ? msg.content : "새 대화",
        });
      }
    }

    return [...sessionMap.values()]
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 50);
  },
});

export const getSessionMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return messages.map((m) => {
      let refs: { sermon_id: string; title: string }[] | undefined;
      if (m.sermonRefs) {
        try {
          refs = JSON.parse(m.sermonRefs);
        } catch {
          refs = undefined;
        }
      }
      return {
        role: m.role,
        content: m.content,
        refs,
      };
    });
  },
});

export const deleteSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
  },
});

export const saveMessages = mutation({
  args: {
    sessionId: v.string(),
    userMessage: v.string(),
    assistantMessage: v.string(),
    sermonRefs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: "user",
      content: args.userMessage,
    });
    await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: "assistant",
      content: args.assistantMessage,
      sermonRefs: args.sermonRefs,
    });
  },
});
