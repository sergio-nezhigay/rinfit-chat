import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

/**
 * Store a code verifier for PKCE authentication
 * @param {string} state - The state parameter used in OAuth flow
 * @param {string} verifier - The code verifier to store
 * @returns {Promise<Object>} - The saved code verifier object
 */
export async function storeCodeVerifier(state, verifier) {
  // Calculate expiration date (10 minutes from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  try {
    return await prisma.codeVerifier.create({
      data: {
        id: `cv_${Date.now()}`,
        state,
        verifier,
        expiresAt
      }
    });
  } catch (error) {
    console.error('Error storing code verifier:', error);
    throw error;
  }
}

/**
 * Get a code verifier by state parameter
 * @param {string} state - The state parameter used in OAuth flow
 * @returns {Promise<Object|null>} - The code verifier object or null if not found
 */
export async function getCodeVerifier(state) {
  try {
    const verifier = await prisma.codeVerifier.findFirst({
      where: {
        state,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (verifier) {
      // Delete it after retrieval to prevent reuse
      await prisma.codeVerifier.delete({
        where: {
          id: verifier.id
        }
      });
    }

    return verifier;
  } catch (error) {
    console.error('Error retrieving code verifier:', error);
    return null;
  }
}

/**
 * Store a customer access token in the database
 * @param {string} conversationId - The conversation ID to associate with the token
 * @param {string} accessToken - The access token to store
 * @param {Date} expiresAt - When the token expires
 * @returns {Promise<Object>} - The saved customer token
 */
export async function storeCustomerToken(conversationId, accessToken, expiresAt) {
  try {
    // Check if a token already exists for this conversation
    const existingToken = await prisma.customerToken.findFirst({
      where: { conversationId }
    });

    if (existingToken) {
      // Update existing token
      return await prisma.customerToken.update({
        where: { id: existingToken.id },
        data: {
          accessToken,
          expiresAt,
          updatedAt: new Date()
        }
      });
    }

    // Create a new token record
    return await prisma.customerToken.create({
      data: {
        id: `ct_${Date.now()}`,
        conversationId,
        accessToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer token:', error);
    throw error;
  }
}

/**
 * Get a customer access token by conversation ID
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object|null>} - The customer token or null if not found/expired
 */
export async function getCustomerToken(conversationId) {
  try {
    const token = await prisma.customerToken.findFirst({
      where: {
        conversationId,
        expiresAt: {
          gt: new Date() // Only return non-expired tokens
        }
      }
    });

    return token;
  } catch (error) {
    console.error('Error retrieving customer token:', error);
    return null;
  }
}

/**
 * Create or update a conversation in the database
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} - The created or updated conversation
 */
export async function createOrUpdateConversation(conversationId) {
  try {
    const existingConversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (existingConversation) {
      return await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date()
        }
      });
    }

    return await prisma.conversation.create({
      data: {
        id: conversationId
      }
    });
  } catch (error) {
    console.error('Error creating/updating conversation:', error);
    throw error;
  }
}

/**
 * Save a message to the database
 * @param {string} conversationId - The conversation ID
 * @param {string} role - The message role (user or assistant)
 * @param {string} content - The message content
 * @returns {Promise<Object>} - The saved message
 */
export async function saveMessage(conversationId, role, content) {
  try {
    // Ensure the conversation exists
    await createOrUpdateConversation(conversationId);

    // Create the message
    return await prisma.message.create({
      data: {
        conversationId,
        role,
        content
      }
    });
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

/**
 * Get conversation history
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array>} - Array of messages in the conversation
 */
export async function getConversationHistory(conversationId) {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });

    return messages;
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    return [];
  }
}

/**
 * Store customer account URLs for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {string} mcpApiUrl - The customer account MCP URL
 * @param {string} authorizationUrl - The customer account authorization URL
 * @param {string} tokenUrl - The customer account token URL
 * @returns {Promise<Object>} - The saved urls object
 */
export async function storeCustomerAccountUrls({conversationId, mcpApiUrl, authorizationUrl, tokenUrl}) {
  try {
    return await prisma.customerAccountUrls.upsert({
      where: { conversationId },
      create: {
        conversationId,
        mcpApiUrl,
        authorizationUrl,
        tokenUrl,
        updatedAt: new Date(),
      },
      update: {
        mcpApiUrl,
        authorizationUrl,
        tokenUrl,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Error storing customer account URLs:', error);
    throw error;
  }
}

/**
 * Get customer account URLs for a conversation
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object|null>} - The customer account URLs or null if not found
 */
export async function getCustomerAccountUrls(conversationId) {
  try {
    return await prisma.customerAccountUrls.findUnique({
      where: { conversationId }
    });
  } catch (error) {
    console.error('Error retrieving customer account URLs:', error);
    return null;
  }
}

/**
 * List conversations with optional filtering, sorting, and pagination.
 * @param {Object} options
 * @param {number} options.skip
 * @param {number} options.take
 * @param {string} options.sortBy - 'updatedAt' | 'createdAt' | 'messageCount'
 * @param {string} options.order - 'asc' | 'desc'
 * @param {string|undefined} options.dateFrom - ISO date string (inclusive)
 * @param {string|undefined} options.dateTo   - ISO date string (inclusive, end of day)
 * @param {number|undefined} options.minMessages
 * @returns {Promise<{conversations: Array, total: number}>}
 */
export async function listConversations({
  skip = 0,
  take = 20,
  sortBy = 'updatedAt',
  order = 'desc',
  dateFrom,
  dateTo,
  minMessages,
} = {}) {
  const where = {};
  if (dateFrom || dateTo) {
    where.updatedAt = {};
    if (dateFrom) where.updatedAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.updatedAt.lte = end;
    }
  }

  const include = {
    _count: { select: { messages: true } },
    messages: {
      where: { role: 'user' },
      orderBy: { createdAt: 'asc' },
      take: 1,
    },
  };

  // messageCount sort is not natively supported by Prisma on SQLite _count;
  // fetch all matching rows then sort + paginate in JS.
  if (sortBy === 'messageCount') {
    const all = await prisma.conversation.findMany({ where, include });
    const filtered = minMessages
      ? all.filter((c) => c._count.messages >= Number(minMessages))
      : all;
    filtered.sort((a, b) =>
      order === 'asc'
        ? a._count.messages - b._count.messages
        : b._count.messages - a._count.messages,
    );
    return {
      conversations: filtered.slice(skip, skip + take),
      total: filtered.length,
    };
  }

  const orderBy = { [sortBy]: order };

  // For date-based sorts we can filter minMessages via a having-style JS filter
  // after fetching, keeping it simple without raw SQL.
  if (minMessages) {
    const all = await prisma.conversation.findMany({ where, orderBy, include });
    const filtered = all.filter((c) => c._count.messages >= Number(minMessages));
    return {
      conversations: filtered.slice(skip, skip + take),
      total: filtered.length,
    };
  }

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({ where, orderBy, skip, take, include }),
    prisma.conversation.count({ where }),
  ]);
  return { conversations, total };
}

/**
 * Fetch all conversations (no pagination) for CSV export, with optional date filter.
 * @param {Object} options
 * @param {string|undefined} options.dateFrom
 * @param {string|undefined} options.dateTo
 * @param {number|undefined} options.minMessages
 * @param {string} options.sortBy
 * @param {string} options.order
 * @returns {Promise<Array>}
 */
export async function getAllConversationsForExport({
  dateFrom,
  dateTo,
  minMessages,
  sortBy = 'updatedAt',
  order = 'desc',
} = {}) {
  const where = {};
  if (dateFrom || dateTo) {
    where.updatedAt = {};
    if (dateFrom) where.updatedAt.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.updatedAt.lte = end;
    }
  }

  const include = {
    _count: { select: { messages: true } },
    messages: {
      where: { role: 'user' },
      orderBy: { createdAt: 'asc' },
      take: 1,
    },
  };

  const orderBy = sortBy === 'messageCount' ? { updatedAt: order } : { [sortBy]: order };
  let rows = await prisma.conversation.findMany({ where, orderBy, include });

  if (minMessages) {
    rows = rows.filter((c) => c._count.messages >= Number(minMessages));
  }
  if (sortBy === 'messageCount') {
    rows.sort((a, b) =>
      order === 'asc'
        ? a._count.messages - b._count.messages
        : b._count.messages - a._count.messages,
    );
  }
  return rows;
}

/**
 * Get a single conversation with all messages ordered by createdAt
 * @param {string} id - The conversation ID
 * @returns {Promise<Object|null>} - The conversation with messages or null if not found
 */
export async function getConversationWithMessages(id) {
  return prisma.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}
