import { DescribeVoicesCommand, PollyServiceException, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { BadRequestError, UpstreamServiceError } from '../errors/index.js';

const DEFAULT_LANGUAGE = 'en-US';

// Polly rejects a LanguageCode it does not know with one of these.
const LANGUAGE_ERRORS = new Set(['ValidationException', 'LanguageNotSupportedException']);

/** "{name} from {country}", using "de" for Portuguese and Spanish. */
export function buildText(name, country, languageCode) {
  const safeName = name?.trim() || 'unknown';
  const safeCountry = country?.trim();
  if (!safeCountry) return safeName;

  const from = languageCode.startsWith('pt') || languageCode.startsWith('es') ? 'de' : 'from';
  return `${safeName} ${from} ${safeCountry}`;
}

/**
 * Synthesizes customer-name audio via AWS Polly (Neural TTS) and returns MP3 bytes.
 *
 * Credentials come from the AWS SDK default provider chain: env vars
 * (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), ~/.aws config (profiles, SSO, `aws login`),
 * or the container / instance IAM role.
 */
export function createPronounceService({ pollyClient, defaultVoiceId, logger }) {
  // language -> Promise<voiceId>. Caching the promise de-duplicates concurrent lookups.
  const voiceByLanguage = new Map();

  function toAppError(err, languageCode, action) {
    if (!(err instanceof PollyServiceException)) return err;
    if (LANGUAGE_ERRORS.has(err.name)) {
      return new BadRequestError(`Unsupported language '${languageCode}'`, { cause: err });
    }
    return new UpstreamServiceError(`AWS Polly ${action} failed`, { cause: err });
  }

  /**
   * The voice, not the LanguageCode, determines the accent: Polly only honours LanguageCode
   * for bilingual voices. So pick a neural voice native to the requested language: the
   * configured voice if it matches, otherwise the first one Polly lists for that language.
   */
  function resolveVoice(languageCode) {
    let voice = voiceByLanguage.get(languageCode);
    if (!voice) {
      voice = (async () => {
        const { Voices = [] } = await pollyClient.send(
          new DescribeVoicesCommand({ Engine: 'neural', LanguageCode: languageCode }),
        );
        const chosen =
          Voices.find((v) => v.Id?.toLowerCase() === defaultVoiceId.toLowerCase())?.Id ??
          Voices[0]?.Id ??
          defaultVoiceId;
        logger.info({ language: languageCode, voice: chosen }, 'AWS Polly voice resolved');
        return chosen;
      })();
      // Don't cache failures, so a transient error can be retried.
      voice.catch(() => voiceByLanguage.delete(languageCode));
      voiceByLanguage.set(languageCode, voice);
    }
    return voice;
  }

  return {
    async synthesize({ name, country, languageCode = DEFAULT_LANGUAGE }) {
      const lang = languageCode?.trim() || DEFAULT_LANGUAGE;
      const text = buildText(name, country, lang);

      let voice;
      try {
        voice = await resolveVoice(lang);
      } catch (err) {
        throw toAppError(err, lang, 'voice lookup');
      }

      logger.debug({ voice, language: lang, text }, 'Calling AWS Polly');
      try {
        const { AudioStream } = await pollyClient.send(
          new SynthesizeSpeechCommand({
            Text: text,
            VoiceId: voice,
            LanguageCode: lang,
            OutputFormat: 'mp3',
            Engine: 'neural',
          }),
        );
        const audio = Buffer.from(await AudioStream.transformToByteArray());
        logger.debug({ bytes: audio.length, text }, 'AWS Polly returned audio');
        return audio;
      } catch (err) {
        throw toAppError(err, lang, 'synthesis');
      }
    },
  };
}
