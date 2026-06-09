/**
 * 解析 fetch ReadableStream 中的 SSE 事件块
 */
export async function consumeAssistantSse(response, handlers = {}) {
  if (!response?.body?.getReader) {
    throw new Error('AI 服务暂时不可用，请稍后重试');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let splitAt;
      while ((splitAt = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, splitAt);
        buffer = buffer.slice(splitAt + 2);
        dispatchSseBlock(block, handlers);
      }
    }
    if (buffer.trim()) {
      dispatchSseBlock(buffer, handlers);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

function dispatchSseBlock(block, handlers) {
  let event = 'message';
  const dataLines = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return;

  let payload;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    return;
  }

  switch (event) {
    case 'start':
      handlers.onStart?.(payload);
      break;
    case 'delta':
      handlers.onDelta?.(payload);
      break;
    case 'refs':
      handlers.onReferences?.(payload);
      break;
    case 'done':
      handlers.onDone?.(payload);
      break;
    case 'error':
      handlers.onError?.(payload);
      break;
    default:
      break;
  }
}
