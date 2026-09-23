import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { DescribeVoicesCommand, PollyServiceException, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { BadRequestError, UpstreamServiceError } from '../src/errors/index.js';
import { buildText, createPronounceService } from '../src/pronounce/pronounce.service.js';
import { silentLogger } from './helpers.js';

function pollyError(name) {
  return new PollyServiceException({ name, $fault: 'client', $metadata: {}, message: name });
}

function fakePolly({ voices = [{ Id: 'Camila' }, { Id: 'Vitoria' }], describeError, synthError } = {}) {
  return {
    send: mock.fn(async (command) => {
      if (command instanceof DescribeVoicesCommand) {
        if (describeError) throw describeError;
        return { Voices: voices };
      }
      if (command instanceof SynthesizeSpeechCommand) {
        if (synthError) throw synthError;
        return { AudioStream: { transformToByteArray: async () => new Uint8Array([0x49, 0x44, 0x33]) } };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    }),
  };
}

describe('buildText', () => {
  it('uses "from" for English and "de" for Portuguese / Spanish', () => {
    assert.equal(buildText('Ana', 'Brazil', 'en-US'), 'Ana from Brazil');
    assert.equal(buildText('Ana', 'Brasil', 'pt-BR'), 'Ana de Brasil');
    assert.equal(buildText('Ana', 'España', 'es-ES'), 'Ana de España');
  });

  it('omits a blank country and defaults a blank name', () => {
    assert.equal(buildText(' Ana ', '  ', 'en-US'), 'Ana');
    assert.equal(buildText(null, null, 'en-US'), 'unknown');
  });
});

describe('pronounceService.synthesize', () => {
  it('picks a native voice for the language and returns MP3 bytes', async () => {
    const pollyClient = fakePolly();
    const service = createPronounceService({ pollyClient, defaultVoiceId: 'Joanna', logger: silentLogger });

    const audio = await service.synthesize({ name: 'Ana', country: 'Brasil', languageCode: 'pt-BR' });

    assert.ok(Buffer.isBuffer(audio));
    assert.deepEqual([...audio], [0x49, 0x44, 0x33]);

    const synth = pollyClient.send.mock.calls[1].arguments[0].input;
    assert.deepEqual(synth, {
      Text: 'Ana de Brasil',
      VoiceId: 'Camila',
      LanguageCode: 'pt-BR',
      OutputFormat: 'mp3',
      Engine: 'neural',
    });
  });

  it('prefers the configured voice when it supports the language', async () => {
    const pollyClient = fakePolly({ voices: [{ Id: 'Danielle' }, { Id: 'Joanna' }] });
    const service = createPronounceService({ pollyClient, defaultVoiceId: 'joanna', logger: silentLogger });

    await service.synthesize({ name: 'Ana', country: null, languageCode: 'en-US' });

    assert.equal(pollyClient.send.mock.calls[1].arguments[0].input.VoiceId, 'Joanna');
  });

  it('caches the voice per language', async () => {
    const pollyClient = fakePolly();
    const service = createPronounceService({ pollyClient, defaultVoiceId: 'Joanna', logger: silentLogger });

    await Promise.all([
      service.synthesize({ name: 'A', languageCode: 'pt-BR' }),
      service.synthesize({ name: 'B', languageCode: 'pt-BR' }),
    ]);

    const describeCalls = pollyClient.send.mock.calls.filter((c) => c.arguments[0] instanceof DescribeVoicesCommand);
    assert.equal(describeCalls.length, 1);
  });

  it('falls back to the configured voice when Polly lists none', async () => {
    const pollyClient = fakePolly({ voices: [] });
    const service = createPronounceService({ pollyClient, defaultVoiceId: 'Joanna', logger: silentLogger });

    await service.synthesize({ name: 'Ana', languageCode: 'en-US' });

    assert.equal(pollyClient.send.mock.calls[1].arguments[0].input.VoiceId, 'Joanna');
  });

  it('maps an unsupported language to BadRequestError and does not cache the failure', async () => {
    const pollyClient = fakePolly({ describeError: pollyError('ValidationException') });
    const service = createPronounceService({ pollyClient, defaultVoiceId: 'Joanna', logger: silentLogger });

    await assert.rejects(service.synthesize({ name: 'Ana', languageCode: 'xx-XX' }), BadRequestError);
    await assert.rejects(service.synthesize({ name: 'Ana', languageCode: 'xx-XX' }), BadRequestError);
    assert.equal(pollyClient.send.mock.callCount(), 2);
  });

  it('maps other Polly failures to UpstreamServiceError', async () => {
    const pollyClient = fakePolly({ synthError: pollyError('ServiceFailureException') });
    const service = createPronounceService({ pollyClient, defaultVoiceId: 'Joanna', logger: silentLogger });

    await assert.rejects(service.synthesize({ name: 'Ana', languageCode: 'en-US' }), UpstreamServiceError);
  });
});
