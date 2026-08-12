import { describe, expect, it } from "vitest";
import {
    UserMessage,
    GroupMessage,
    ThreadType,
    type Message,
    type TMessage,
    type TGroupMessage,
} from "../../src/models/index.js";

function baseMessageData(overrides: Partial<TMessage> = {}): TMessage {
    return {
        actionId: "1",
        msgId: "1",
        cliMsgId: "1",
        msgType: "webchat",
        uidFrom: "111",
        idTo: "222",
        dName: "Someone",
        ts: "0",
        status: 0,
        content: "hello",
        notify: "",
        ttl: 0,
        userId: "111",
        uin: "111",
        topOut: "",
        topOutTimeOut: "",
        topOutImprTimeOut: "",
        propertyExt: undefined,
        paramsExt: { countUnread: 0, containType: 0, platformType: 0 },
        cmd: 0,
        st: 0,
        at: 0,
        realMsgId: "1",
        quote: undefined,
        ...overrides,
    };
}

/** Type guard a consumer might write against the discriminated Message union. */
function isGroupMessage(message: Message): message is GroupMessage {
    return message.type === ThreadType.Group;
}
function isUserMessage(message: Message): message is UserMessage {
    return message.type === ThreadType.User;
}

describe("UserMessage / GroupMessage", () => {
    it("UserMessage is tagged with ThreadType.User", () => {
        const msg = new UserMessage("own-uid", baseMessageData());
        expect(msg.type).toBe(ThreadType.User);
        expect(isUserMessage(msg)).toBe(true);
        expect(isGroupMessage(msg)).toBe(false);
    });

    it("GroupMessage is tagged with ThreadType.Group", () => {
        const data = baseMessageData() as TGroupMessage;
        data.mentions = undefined;
        const msg = new GroupMessage("own-uid", data);
        expect(msg.type).toBe(ThreadType.Group);
        expect(isGroupMessage(msg)).toBe(true);
        expect(isUserMessage(msg)).toBe(false);
    });

    it("UserMessage.isSelf is true when uidFrom is '0' (own account, per zca-js convention)", () => {
        const msg = new UserMessage("own-uid", baseMessageData({ uidFrom: "0", idTo: "222" }));
        expect(msg.isSelf).toBe(true);
        expect(msg.data.uidFrom).toBe("own-uid"); // rewritten from placeholder "0"
    });

    it("UserMessage.isSelf is false for messages from another user", () => {
        const msg = new UserMessage("own-uid", baseMessageData({ uidFrom: "someone-else" }));
        expect(msg.isSelf).toBe(false);
    });

    it("UserMessage.threadId resolves to the other participant", () => {
        const incoming = new UserMessage("own-uid", baseMessageData({ uidFrom: "friend", idTo: "own-uid" }));
        expect(incoming.threadId).toBe("friend");

        const outgoing = new UserMessage("own-uid", baseMessageData({ uidFrom: "0", idTo: "friend" }));
        expect(outgoing.threadId).toBe("friend");
    });

    it("GroupMessage.threadId is always the group id (idTo)", () => {
        const data = baseMessageData({ idTo: "group-1" }) as TGroupMessage;
        const msg = new GroupMessage("own-uid", data);
        expect(msg.threadId).toBe("group-1");
    });
});
