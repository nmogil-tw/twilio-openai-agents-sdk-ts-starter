import { DefaultPhoneSubjectResolver } from '../../src/services/subjectResolver';

describe('DefaultPhoneSubjectResolver', () => {
  let resolver: DefaultPhoneSubjectResolver;

  beforeEach(() => {
    resolver = new DefaultPhoneSubjectResolver();
  });

  describe('resolve', () => {
    it('should resolve phone number to consistent subject ID', async () => {
      const metadata = { phone: '+14155550100' };
      const subjectId = await resolver.resolve(metadata);
      
      expect(subjectId).toBe('phone_+14155550100');
    });

    it('should handle different phone number formats and normalize to E.164', async () => {
      const testCases = [
        { input: '+14155550100', expected: 'phone_+14155550100' },
        { input: '4155550100', expected: 'phone_+14155550100' },
        { input: '14155550100', expected: 'phone_+14155550100' },
        { input: '(415) 555-0100', expected: 'phone_+14155550100' },
        { input: '415-555-0100', expected: 'phone_+14155550100' },
        { input: '415.555.0100', expected: 'phone_+14155550100' },
      ];

      for (const testCase of testCases) {
        const metadata = { phone: testCase.input };
        const subjectId = await resolver.resolve(metadata);
        expect(subjectId).toBe(testCase.expected);
      }
    });

    it('should extract phone number from various metadata keys', async () => {
      const testCases = [
        { phone: '+14155550100' },
        { from: '+14155550100' },
        { From: '+14155550100' },
        { phoneNumber: '+14155550100' },
        { callerPhone: '+14155550100' },
        { senderPhone: '+14155550100' },
      ];

      for (const metadata of testCases) {
        const subjectId = await resolver.resolve(metadata);
        expect(subjectId).toBe('phone_+14155550100');
      }
    });

    it('should produce same subject ID across SMS and Voice channels for same phone', async () => {
      const smsMetadata = {
        phone: '+14155550100',
        channel: 'sms',
        messageSid: 'SM123'
      };

      const voiceMetadata = {
        from: '+14155550100',
        channel: 'voice',
        callSid: 'CA123'
      };

      const smsSubjectId = await resolver.resolve(smsMetadata);
      const voiceSubjectId = await resolver.resolve(voiceMetadata);

      expect(smsSubjectId).toBe(voiceSubjectId);
      expect(smsSubjectId).toBe('phone_+14155550100');
    });

    it('should handle international phone numbers', async () => {
      const testCases = [
        { input: '+447700900123', expected: 'phone_+447700900123' }, // UK
        { input: '+86138000800', expected: 'phone_+86138000800' }, // China
        { input: '+33123456789', expected: 'phone_+33123456789' }, // France
      ];

      for (const testCase of testCases) {
        const metadata = { phone: testCase.input };
        const subjectId = await resolver.resolve(metadata);
        expect(subjectId).toBe(testCase.expected);
      }
    });

    it('should throw error when no phone number found', async () => {
      const metadata = { userId: '12345', sessionId: 'sess_abc' };
      
      await expect(resolver.resolve(metadata)).rejects.toThrow(
        'No valid phone number found in metadata for phone-based subject resolution'
      );
    });

    it('should throw error when phone number is empty', async () => {
      const metadata = { phone: '' };
      
      await expect(resolver.resolve(metadata)).rejects.toThrow(
        'No valid phone number found in metadata for phone-based subject resolution'
      );
    });

    it('should throw error when phone number is whitespace only', async () => {
      const metadata = { phone: '   ' };
      
      await expect(resolver.resolve(metadata)).rejects.toThrow(
        'No valid phone number found in metadata for phone-based subject resolution'
      );
    });

    it('should handle Twilio SMS webhook format', async () => {
      const twilioSmsMetadata = {
        MessageSid: 'SM123',
        From: '+14155550100',
        To: '+14155550200',
        Body: 'Hello',
        AccountSid: 'AC123'
      };

      const subjectId = await resolver.resolve(twilioSmsMetadata);
      expect(subjectId).toBe('phone_+14155550100');
    });

    it('should handle Twilio Voice webhook format', async () => {
      const twilioVoiceMetadata = {
        CallSid: 'CA123',
        From: '+14155550100',
        To: '+14155550200',
        CallStatus: 'in-progress'
      };

      const subjectId = await resolver.resolve(twilioVoiceMetadata);
      expect(subjectId).toBe('phone_+14155550100');
    });
  });
});