const MAX_CLAIM_LENGTH = Number(process.env.MAX_CLAIM_LENGTH || 5000);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

export const sanitizeClaim = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  // Remove control characters and normalize whitespace.
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const validateClaim = (claim) => {
  const sanitizedClaim = sanitizeClaim(claim);

  if (!sanitizedClaim) {
    return {
      isValid: false,
      reason: 'EMPTY_CLAIM',
      message: 'Claim is required.'
    };
  }

  if (sanitizedClaim.length > MAX_CLAIM_LENGTH) {
    return {
      isValid: false,
      reason: 'CLAIM_TOO_LONG',
      message: `Claim exceeds ${MAX_CLAIM_LENGTH} characters.`
    };
  }

  return {
    isValid: true,
    sanitizedClaim
  };
};

export const validateImageMimeType = (mimeType) => {
  if (!mimeType) {
    return {
      isValid: false,
      reason: 'UNSUPPORTED_IMAGE_TYPE',
      message: 'Image type is missing.'
    };
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      isValid: false,
      reason: 'UNSUPPORTED_IMAGE_TYPE',
      message: 'Only PNG, JPEG, and WEBP images are supported.'
    };
  }

  return { isValid: true };
};

export const parseBatchClaims = (claims) => {
  if (!Array.isArray(claims) || claims.length === 0) {
    return {
      isValid: false,
      reason: 'EMPTY_BATCH',
      message: 'Provide a non-empty claims array.'
    };
  }

  if (claims.length > 20) {
    return {
      isValid: false,
      reason: 'BATCH_TOO_LARGE',
      message: 'At most 20 claims can be verified in one request.'
    };
  }

  const cleanedClaims = [];

  for (const claim of claims) {
    const validated = validateClaim(claim);
    if (!validated.isValid) {
      return {
        isValid: false,
        reason: validated.reason,
        message: `Invalid claim in batch: ${validated.message}`
      };
    }
    cleanedClaims.push(validated.sanitizedClaim);
  }

  return {
    isValid: true,
    cleanedClaims
  };
};
