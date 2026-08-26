const { ConflictError, NotFoundError, BadRequestError } = require("../../common/errors");
const { runTransaction } = require("../../common/transaction");
const logger = require("../../config/logger");
const tagRepository = require("./tag.repository");
const { TagMapper } = require("./tag.mapper");
const { TagDto } = require("./tag.dto");
const { TAG_MESSAGES } = require("./tag.constants");

/**
 * ==========================================================
 * Tag Service
 * ==========================================================
 * Single Domain Service class handling all Tag business operations.
 * Placed directly at module root matching Option A Standard.
 * ==========================================================
 */
class TagService {
  async createTag(payload, userId) {
    const name = payload.name.trim();
    logger.info({ userId, name }, "Initiating tag creation");

    const existingTag = await tagRepository.findByName(name);
    if (existingTag) {
      throw new ConflictError("Tag already exists.", "TAG_ALREADY_EXISTS");
    }

    const createdTag = await runTransaction(async (tx) => {
      const tagData = TagMapper.toCreateEntity(payload, userId);
      return tagRepository.create(tx, tagData);
    });

    return {
      message: TAG_MESSAGES.CREATED,
      data: TagDto.toResponse(createdTag),
    };
  }

  async getTags(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const search = query.search?.trim();

    const { tags, total } = await tagRepository.findAllPaginated({
      page,
      limit,
      search,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      message: TAG_MESSAGES.LIST_FETCHED,
      data: TagDto.toCollection(tags),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getTagById(id) {
    const tag = await tagRepository.findById(id);
    if (!tag) {
      throw new NotFoundError("Tag not found.", "TAG_NOT_FOUND");
    }

    return {
      message: TAG_MESSAGES.FETCHED,
      data: TagDto.toResponse(tag),
    };
  }

  async updateTag(id, payload, userId) {
    const tag = await tagRepository.findById(id);
    if (!tag) {
      throw new NotFoundError("Tag not found.", "TAG_NOT_FOUND");
    }

    if (payload.name) {
      const name = payload.name.trim();
      const existing = await tagRepository.findByName(name);
      if (existing && existing.id !== id) {
        throw new ConflictError("Tag name already exists.", "TAG_ALREADY_EXISTS");
      }
    }

    const updateData = TagMapper.toUpdateEntity(payload, userId);
    const updatedTag = await runTransaction(async (tx) => {
      return tagRepository.update(tx, id, updateData);
    });

    return {
      message: TAG_MESSAGES.UPDATED,
      data: TagDto.toResponse(updatedTag),
    };
  }

  async deleteTag(id, userId) {
    const tag = await tagRepository.findById(id);
    if (!tag) {
      throw new NotFoundError("Tag not found.", "TAG_NOT_FOUND");
    }

    const deletedTag = await runTransaction(async (tx) => {
      return tagRepository.softDelete(tx, id);
    });

    return {
      message: TAG_MESSAGES.DELETED,
      data: { id: deletedTag.id, deletedAt: deletedTag.deletedAt },
    };
  }

  async restoreTag(id, userId) {
    const tag = await tagRepository.findById(id, { includeDeleted: true });
    if (!tag) {
      throw new NotFoundError("Tag not found.", "TAG_NOT_FOUND");
    }

    if (!tag.deletedAt) {
      throw new ConflictError("Tag is already active.", "TAG_ALREADY_ACTIVE");
    }

    const restoredTag = await runTransaction(async (tx) => {
      return tagRepository.restore(tx, id);
    });

    return {
      message: TAG_MESSAGES.RESTORED,
      data: TagDto.toResponse(restoredTag),
    };
  }
}

module.exports = new TagService();
