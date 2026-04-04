import { fetchData } from '../fetch-data';
import { createRpcClient } from '../rpc-client';

jest.mock('../fetch-data', () => ({
  fetchData: jest.fn().mockResolvedValue({ result: 'ok' }),
}));

const mockFetchData = fetchData as jest.MockedFunction<typeof fetchData>;

function getLastCallOptions() {
  const [url, method, options] = mockFetchData.mock.calls[0];
  return { url, method, options };
}

describe('createRpcClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('JSON body (no files)', () => {
    it('should send a JSON body with entity, operation, and params', async () => {
      const client = createRpcClient('http://localhost/rpc');
      await (client as any).user.get({ id: 1 });

      const { url, method, options } = getLastCallOptions();
      expect(url).toBe('http://localhost/rpc?user::get');
      expect(method).toBe('POST');
      expect(options?.body).toBe(
        JSON.stringify({ entity: 'user', operation: 'get', params: { id: 1 } }),
      );
    });

    it('should send JSON when params is a plain object with no files', async () => {
      const client = createRpcClient('http://localhost/rpc');
      await (client as any).product.list({ page: 2, filters: { active: true } });

      const { options } = getLastCallOptions();
      expect(typeof options?.body).toBe('string');
    });
  });

  describe('FormData body (with files)', () => {
    it('should send FormData when params contain a top-level File', async () => {
      const client = createRpcClient('http://localhost/rpc');
      const file = new File(['content'], 'avatar.png', { type: 'image/png' });

      await (client as any).user.upload({ name: 'John', avatar: file });

      const { options } = getLastCallOptions();
      expect(options?.body).toBeInstanceOf(FormData);

      const formData = options?.body as FormData;
      expect(formData.get('entity')).toBe('user');
      expect(formData.get('operation')).toBe('upload');
      expect(JSON.parse(formData.get('params') as string)).toEqual({ name: 'John' });
      expect(formData.get('avatar')).toBeInstanceOf(File);
      expect((formData.get('avatar') as File).name).toBe('avatar.png');
    });

    it('should send FormData when params contain a Blob', async () => {
      const client = createRpcClient('http://localhost/rpc');
      const blob = new Blob(['data'], { type: 'text/plain' });

      await (client as any).user.upload({ data: blob });

      const { options } = getLastCallOptions();
      expect(options?.body).toBeInstanceOf(FormData);
    });

    it('should extract nested files using dot-notation keys', async () => {
      const client = createRpcClient('http://localhost/rpc');
      const resume = new File(['pdf'], 'resume.pdf', { type: 'application/pdf' });
      const photo = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });

      await (client as any).user.upload({
        name: 'John',
        documents: { resume, profile: { photo } },
      });

      const { options } = getLastCallOptions();
      const formData = options?.body as FormData;

      expect(formData.get('documents.resume')).toBeInstanceOf(File);
      expect(formData.get('documents.profile.photo')).toBeInstanceOf(File);

      const params = JSON.parse(formData.get('params') as string);
      expect(params.name).toBe('John');
      expect(params.documents.resume).toBeUndefined();
      expect(params.documents.profile.photo).toBeUndefined();
    });

    it('should extract files from arrays using index dot-notation', async () => {
      const client = createRpcClient('http://localhost/rpc');
      const file1 = new File(['a'], 'a.txt');
      const file2 = new File(['b'], 'b.txt');

      await (client as any).user.upload({ attachments: [file1, file2] });

      const { options } = getLastCallOptions();
      const formData = options?.body as FormData;

      expect(formData.get('attachments.0')).toBeInstanceOf(File);
      expect(formData.get('attachments.1')).toBeInstanceOf(File);

      const params = JSON.parse(formData.get('params') as string);
      // JSON.stringify converts undefined array items to null
      expect(params.attachments[0]).toBeNull();
      expect(params.attachments[1]).toBeNull();
    });
  });

  describe('headers', () => {
    it('should pass static headers', async () => {
      const headers = { Authorization: 'Bearer token' };
      const client = createRpcClient('http://localhost/rpc', headers);
      await (client as any).user.get({ id: 1 });

      const { options } = getLastCallOptions();
      expect(options?.headers).toEqual(headers);
    });

    it('should resolve headers from a function using context', async () => {
      const client = createRpcClient('http://localhost/rpc', (context: any) => ({
        Authorization: `Bearer ${context?.token}`,
      }));

      await (client as any).user.get({ id: 1 }, undefined, {
        token: 'abc',
        request: {} as Request,
      });

      const { options } = getLastCallOptions();
      expect(options?.headers).toEqual({ Authorization: 'Bearer abc' });
    });
  });

  describe('abort signal', () => {
    it('should forward the AbortSignal to fetchData', async () => {
      const client = createRpcClient('http://localhost/rpc');
      const controller = new AbortController();

      await (client as any).user.get({ id: 1 }, controller.signal);

      const { options } = getLastCallOptions();
      expect(options?.signal).toBe(controller.signal);
    });
  });
});
