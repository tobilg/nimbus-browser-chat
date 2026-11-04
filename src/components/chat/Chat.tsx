import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionBarPrimitive, AssistantRuntimeProvider, AuiIf, ComposerPrimitive,
  MessagePrimitive, ThreadPrimitive, useLocalRuntime,
  type ChatModelAdapter, type ChatModelRunResult, type ReasoningMessagePartProps, type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { ArrowDownIcon as ArrowDown, ArrowUpIcon as ArrowUp, BooksIcon as Books, CheckIcon as Check, CopyIcon as Copy, CpuIcon as Cpu, DownloadSimpleIcon as DownloadSimple, PlusIcon as Plus, ShieldCheckIcon as ShieldCheck, SquareIcon as Square, ArrowClockwiseIcon } from "@phosphor-icons/react";
import remarkGfm from "remark-gfm";
import { MODELS, formatBytes, type LocalModel } from "../../lib/chat/models";
import type { BrowserChatRuntime, RuntimeStatus } from "../../lib/chat/browser-runtime";
import type { DownloadConsent } from "../../lib/chat/model-cache";
import "./chat.css";

interface ConsentRequest { model: LocalModel; resolve: (accepted: boolean) => void }

function DownloadDialog({ request }: { request: ConsentRequest | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (request) dialog.current?.showModal();
    else dialog.current?.close();
  }, [request]);
  return <dialog ref={dialog} className="chat-download" aria-labelledby="download-title" aria-describedby="download-description" onCancel={event => { event.preventDefault(); request?.resolve(false); }}>
    {request && <>
      <DownloadSimple size={28} aria-hidden="true" />
      <h2 id="download-title">Download {request.model.name}?</h2>
      <p id="download-description">This downloads <strong>{formatBytes(request.model.bytes)}</strong> from Hugging Face, plus the browser inference runtime. The model runs on your device and is cached in this browser for next time.</p>
      <p className="chat-secondary">{request.model.description}. Allow extra free memory for inference. Your pending message will run after the download finishes.</p>
      <a href={request.model.source} target="_blank" rel="noreferrer">View model source (Q4_K_M)</a>
      <div className="chat-dialog-actions">
        <button className="chat-button" onClick={() => request.resolve(false)} autoFocus>Cancel</button>
        <button className="chat-button chat-primary" onClick={() => request.resolve(true)}>Download and continue</button>
      </div>
    </>}
  </dialog>;
}

function Reasoning({ text }: ReasoningMessagePartProps) {
  return <details className="chat-reasoning"><summary>Thinking</summary><div>{text}</div></details>;
}

function ToolResult({ toolName, args, result, isError }: ToolCallMessagePartProps) {
  const completed = result !== undefined;
  const data = result && typeof result === "object" ? result as { title?: string; url?: string } : undefined;
  const label = toolName === "list_pages" ? "Browse documentation" : `Read ${data?.title ?? args.url ?? "a documentation page"}`;
  const source = typeof data?.url === "string" && /^(https?:\/\/|\/(?!\/))/.test(data.url) ? data.url : undefined;
  return <div className={`chat-tool ${isError ? "chat-tool-error" : ""}`}>
    {completed ? <Check size={15} aria-hidden="true" /> : <Books size={15} aria-hidden="true" />}
    {completed && !isError && source ? <a href={source} target="_blank" rel="noreferrer">{label}</a> : <span>{label}{isError ? " (lookup failed)" : !completed ? "..." : ""}</span>}
  </div>;
}

function Markdown() {
  return <MarkdownTextPrimitive className="chat-markdown" remarkPlugins={[remarkGfm]} smooth={false}
    components={{ img: () => null, a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }} />;
}

function UserMessage() {
  return <MessagePrimitive.Root className="chat-message chat-user" aria-label="Your message"><MessagePrimitive.Parts /></MessagePrimitive.Root>;
}

function AssistantMessage() {
  return <MessagePrimitive.Root className="chat-message chat-assistant" aria-label="Assistant response">
    <div className="chat-author"><Cpu size={18} aria-hidden="true" /><span>Nimbus</span></div>
    <MessagePrimitive.Parts components={{ Text: Markdown, Reasoning, tools: { Fallback: ToolResult } }} />
    <MessagePrimitive.Error><p className="chat-error">This response could not finish. Try a shorter question or a smaller model.</p></MessagePrimitive.Error>
    <ActionBarPrimitive.Root className="chat-message-actions">
      <ActionBarPrimitive.Copy className="chat-icon-button" aria-label="Copy response"><Copy size={16} /></ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload className="chat-icon-button" aria-label="Retry response"><ArrowClockwiseIcon size={16} /></ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  </MessagePrimitive.Root>;
}

const phaseLabels: Record<RuntimeStatus["phase"], string> = {
  idle: "", checking: "Checking browser storage...", downloading: "Downloading model...",
  loading: "Loading model into memory...", connecting: "Connecting to the documentation...", generating: "Generating on your device...",
};

export default function Chat({ endpoint }: { endpoint: string }) {
  const [modelId, setModelId] = useState(MODELS[0]!.id);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<RuntimeStatus>({ phase: "idle" });
  const [cached, setCached] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState<ConsentRequest | null>(null);
  const [removing, setRemoving] = useState(false);
  const engine = useRef<Promise<BrowserChatRuntime> | null>(null);
  const mounted = useRef(true);
  const pendingConsent = useRef<ConsentRequest | null>(null);
  const preferences = useRef({ modelId, thinking });
  preferences.current = { modelId, thinking };
  const model = MODELS.find(item => item.id === modelId)!;
  const busy = status.phase !== "idle" || removing;

  const getEngine = () => engine.current ??= import("../../lib/chat/browser-runtime").then(({ BrowserChatRuntime }) => new BrowserChatRuntime());
  const refreshCache = async () => {
    try { const models = await (await getEngine()).cachedModels(); if (mounted.current) setCached(models); }
    catch { /* Storage errors are explained when a message needs a model. */ }
  };
  useEffect(() => {
    mounted.current = true;
    void refreshCache();
    return () => {
      mounted.current = false;
      pendingConsent.current?.resolve(false);
      void engine.current?.then(value => value.dispose());
    };
  }, []);

  const requestConsent: DownloadConsent = (definition, signal) => new Promise(resolve => {
    const finish = (accepted: boolean) => {
      signal.removeEventListener("abort", cancel);
      pendingConsent.current = null;
      if (mounted.current) setConsent(null);
      resolve(accepted);
    };
    const cancel = () => finish(false);
    if (signal.aborted || !mounted.current) return resolve(false);
    const request = { model: definition, resolve: finish };
    pendingConsent.current = request;
    signal.addEventListener("abort", cancel, { once: true });
    setConsent(request);
  });

  const adapter = useMemo<ChatModelAdapter>(() => ({
    async *run({ messages, abortSignal }) {
      setError("");
      setStatus({ phase: "checking" });
      let last: ChatModelRunResult = { content: [] };
      try {
        const runner = await getEngine();
        const { modelId: selected, thinking: think } = preferences.current;
        const history = messages.filter(message => message.role === "user" || message.role === "assistant").map(message => ({
          role: message.role as "user" | "assistant",
          content: message.content.filter(part => part.type === "text").map(part => part.text).join("\n"),
        })).filter(message => message.content.trim());
        for await (const snapshot of runner.reply({
          model: MODELS.find(item => item.id === selected)!, thinking: think, history,
          endpoint, consent: requestConsent, signal: abortSignal,
          onStatus: value => { if (mounted.current) setStatus(value); },
        })) {
          last = { content: [
            ...snapshot.tools.map(tool => ({ type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name, args: tool.args, argsText: JSON.stringify(tool.args), result: tool.result, isError: Boolean(tool.error) })),
            ...(snapshot.reasoning ? [{ type: "reasoning" as const, text: snapshot.reasoning }] : []),
            ...(snapshot.text ? [{ type: "text" as const, text: snapshot.text }] : []),
          ] };
          yield last;
        }
      } catch (cause) {
        if (abortSignal.aborted || (cause instanceof Error && cause.name === "AbortError")) {
          yield { ...last, status: { type: "incomplete", reason: "cancelled" } };
        } else {
          const message = cause instanceof Error ? cause.message : "The browser could not complete this response.";
          const detail = /quota/i.test(message) ? "The browser ran out of model storage. Try a regular browser window, free site storage, or choose the 0.8B model." : message;
          if (mounted.current) setError(detail);
          yield { ...last, status: { type: "incomplete", reason: "error", error: detail } };
        }
      } finally {
        if (mounted.current) { setStatus({ phase: "idle" }); void refreshCache(); }
      }
    },
  }), [endpoint]);
  const runtime = useLocalRuntime(adapter);

  return <AssistantRuntimeProvider runtime={runtime}>
    <div className="nimbus-chat">
      <aside className="chat-sidebar" aria-label="Chat navigation">
        <div className="chat-sidebar-title"><Cpu size={22} aria-hidden="true" /><span>Local assistant</span></div>
        <button className="chat-button chat-new" disabled={busy} onClick={() => { runtime.thread.reset(); setError(""); }}><Plus size={18} aria-hidden="true" />New chat</button>
        <nav aria-label="Documentation links"><a href={import.meta.env.BASE_URL} data-astro-reload><Books size={17} aria-hidden="true" />Documentation</a><a href="https://nimbus-docs.com" target="_blank" rel="noreferrer">Nimbus reference</a></nav>
        <div className="chat-privacy"><ShieldCheck size={21} aria-hidden="true" /><h2>Runs on your device</h2><p>The model runs in this browser. Documentation lookups go to this site's MCP endpoint.</p><p>Messages stay in this tab. Reloading clears the conversation.</p></div>
      </aside>
      <ThreadPrimitive.Root className="chat-thread">
        <div className="chat-toolbar"><span>Chat with your docs</span><span className="chat-local-label"><Cpu size={15} aria-hidden="true" />Browser inference</span><button className="chat-icon-button chat-mobile-new" aria-label="New chat" disabled={busy} onClick={() => { runtime.thread.reset(); setError(""); }}><Plus size={19} /></button></div>
        <ThreadPrimitive.Viewport className="chat-viewport">
          <AuiIf condition={state => state.thread.isEmpty}>
            <div className="chat-welcome">
              <Books size={35} weight="light" aria-hidden="true" />
              <h1>What would you like to know?</h1>
              <p>Ask a question. Explore the docs. Keep the model local.</p>
              <div className="chat-suggestions">
                <ThreadPrimitive.Suggestion prompt="How do I get started with this project?" send>Help me get started<ArrowUp size={15} aria-hidden="true" /></ThreadPrimitive.Suggestion>
                <ThreadPrimitive.Suggestion prompt="How does the browser chat use MCP?" send>Explain the MCP connection<ArrowUp size={15} aria-hidden="true" /></ThreadPrimitive.Suggestion>
              </div>
              <p className="chat-welcome-note">Your first message asks permission to download the selected model.</p>
            </div>
          </AuiIf>
          <div className="chat-messages"><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /></div>
        </ThreadPrimitive.Viewport>
        <div className="chat-compose-area">
          <ThreadPrimitive.ScrollToBottom className="chat-scroll-button" aria-label="Scroll to latest message"><ArrowDown size={17} /></ThreadPrimitive.ScrollToBottom>
          {error && <div className="chat-error" role="alert">{error}<button className="chat-text-button" onClick={() => setError("")}>Dismiss</button></div>}
          <div className="chat-status" role="status" aria-live="polite">
            {phaseLabels[status.phase]}
            {status.phase === "downloading" && <><span>{formatBytes(status.loaded ?? 0)} / {formatBytes(status.total ?? model.bytes)}</span><progress aria-label="Model download progress" value={status.loaded ?? 0} max={status.total || model.bytes} /></>}
          </div>
          <ComposerPrimitive.Root className="chat-composer">
            <ComposerPrimitive.Input aria-label="Message" placeholder="Ask your documentation a question..." rows={2} maxLength={4000} className="chat-input" />
            <div className="chat-composer-controls">
              <label className="chat-model-label"><span className="sr-only">Model</span><select aria-label="Model" value={modelId} disabled={busy} onChange={event => setModelId(event.target.value)}>{MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button type="button" role="switch" aria-checked={thinking} aria-label="Thinking" className="chat-thinking" disabled={busy} onClick={() => setThinking(value => !value)}><span className="chat-switch-track"><span /></span>Thinking</button>
              <div className="chat-send-slot">
                <AuiIf condition={state => !state.thread.isRunning}><ComposerPrimitive.Send className="chat-send" aria-label="Send message"><ArrowUp size={20} weight="bold" /></ComposerPrimitive.Send></AuiIf>
                <AuiIf condition={state => state.thread.isRunning}><ComposerPrimitive.Cancel className="chat-send" aria-label="Stop response"><Square size={16} weight="fill" /></ComposerPrimitive.Cancel></AuiIf>
              </div>
            </div>
          </ComposerPrimitive.Root>
          <div className="chat-footnote"><span>{cached.includes(modelId) ? "Model cached in this browser" : `${formatBytes(model.bytes)} download on first use`}</span><span>Answers can be wrong. Check the sources.</span></div>
          {cached.includes(modelId) && <button className="chat-text-button chat-remove" disabled={busy} onClick={async () => { setRemoving(true); try { await (await getEngine()).removeModel(model); await refreshCache(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove model."); } finally { setRemoving(false); } }}>Remove cached {model.name}</button>}
        </div>
      </ThreadPrimitive.Root>
    </div>
    <DownloadDialog request={consent} />
  </AssistantRuntimeProvider>;
}
