import { createRpcHandler } from '../create-rpc-handler';

const mockGet = jest.fn().mockResolvedValue({ id: 1 });
const mockUpload = jest.fn().mockImplementation(async ({ params }: any) => params);

const operations = {
  user: {
    get: mockGet,
    upload: mockUpload,
  },
};

function makeJsonRequest(body: object): Request {
  return new Request('http://localhost/rpc', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFormDataRequest(formData: FormData): Request {
  return new Request('http://localhost/rpc', {
    method: 'POST',
    body: formData,
  });
}

function makeExpressRequest(overrides: Record<string, any> = {}): any {
  return {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data' },
    body: {},
    files: undefined,
    ...overrides,
  };
}

describe('createRpcHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('method validation', () => {
    it('should throw 405 for non-POST requests', async () => {
      const request = new Request('http://localhost/rpc', { method: 'GET' });
      const result = createRpcHandler({ context: { request }, operations });

      await expect(result).rejects.toBeInstanceOf(Response);

      try {
        await result;
      } catch (e: any) {
        expect(e.status).toBe(405);
        expect(JSON.parse(await e.text())).toMatchObject({ key: 'methodNotAllowed' });
      }
    });
  });

  describe('operation resolution', () => {
    it('should call errorHandler with a 501 Response for unknown entity', async () => {
      const request = makeJsonRequest({ entity: 'unknown', operation: 'get', params: {} });
      let capturedError: any;
      const errorHandler = jest.fn().mockImplementation((e) => {
        capturedError = e;
        return new Response('not implemented', { status: 501 });
      });

      await expect(
        createRpcHandler({ context: { request }, operations, errorHandler }),
      ).rejects.toBeInstanceOf(Response);

      expect(capturedError).toBeInstanceOf(Response);
      expect(capturedError.status).toBe(501);
      expect(JSON.parse(await capturedError.text())).toMatchObject({ key: 'notImplemented' });
    });

    it('should call errorHandler with a 501 Response for unknown operation', async () => {
      const request = makeJsonRequest({ entity: 'user', operation: 'unknown', params: {} });
      let capturedError: any;
      const errorHandler = jest.fn().mockImplementation((e) => {
        capturedError = e;
        return new Response('not implemented', { status: 501 });
      });

      await expect(
        createRpcHandler({ context: { request }, operations, errorHandler }),
      ).rejects.toBeInstanceOf(Response);

      expect(capturedError).toBeInstanceOf(Response);
      expect(capturedError.status).toBe(501);
    });
  });

  describe('JSON body', () => {
    it('should call the handler with parsed params', async () => {
      const request = makeJsonRequest({ entity: 'user', operation: 'get', params: { id: 42 } });
      const result = await createRpcHandler({ context: { request }, operations });

      expect(mockGet).toHaveBeenCalledWith({ params: { id: 42 }, context: { request } });
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('FormData body', () => {
    it('should parse entity, operation, and JSON params', async () => {
      const formData = new FormData();
      formData.append('entity', 'user');
      formData.append('operation', 'get');
      formData.append('params', JSON.stringify({ id: 42 }));

      const request = makeFormDataRequest(formData);
      await createRpcHandler({ context: { request }, operations });

      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ params: { id: 42 } }),
      );
    });

    it('should merge a top-level File field into params', async () => {
      const file = new File(['content'], 'avatar.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('entity', 'user');
      formData.append('operation', 'upload');
      formData.append('params', JSON.stringify({ name: 'John' }));
      formData.append('avatar', file);

      const request = makeFormDataRequest(formData);
      await createRpcHandler({ context: { request }, operations });

      const { params } = mockUpload.mock.calls[0][0];
      expect(params.name).toBe('John');
      expect(params.avatar).toBeInstanceOf(File);
      expect((params.avatar as File).name).toBe('avatar.png');
    });

    it('should merge a nested File field using dot-notation key', async () => {
      const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('entity', 'user');
      formData.append('operation', 'upload');
      formData.append('params', JSON.stringify({ name: 'John' }));
      formData.append('documents.resume', file);

      const request = makeFormDataRequest(formData);
      await createRpcHandler({ context: { request }, operations });

      const { params } = mockUpload.mock.calls[0][0];
      expect(params.name).toBe('John');
      expect(params.documents.resume).toBeInstanceOf(File);
    });

    it('should default params to empty object when params field is missing', async () => {
      const formData = new FormData();
      formData.append('entity', 'user');
      formData.append('operation', 'get');

      const request = makeFormDataRequest(formData);
      await createRpcHandler({ context: { request }, operations });

      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ params: {} }),
      );
    });
  });

  describe('Express FormData body', () => {
    it('should parse entity, operation, and JSON params from req.body', async () => {
      const request = makeExpressRequest({
        body: { entity: 'user', operation: 'get', params: JSON.stringify({ id: 42 }) },
      });

      await createRpcHandler({ context: { request }, operations });

      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ params: { id: 42 } }),
      );
    });

    it('should merge files from req.files (multer any) into params', async () => {
      const multerFile = { fieldname: 'avatar', originalname: 'avatar.png', buffer: Buffer.from('img') };
      const request = makeExpressRequest({
        body: { entity: 'user', operation: 'upload', params: JSON.stringify({ name: 'John' }) },
        files: [multerFile],
      });

      await createRpcHandler({ context: { request }, operations });

      const { params } = mockUpload.mock.calls[0][0];
      expect(params.name).toBe('John');
      expect(params.avatar).toBe(multerFile);
    });

    it('should merge files from req.files (multer fields) into params', async () => {
      const multerFile = { fieldname: 'avatar', originalname: 'avatar.png', buffer: Buffer.from('img') };
      const request = makeExpressRequest({
        body: { entity: 'user', operation: 'upload', params: JSON.stringify({ name: 'John' }) },
        files: { avatar: [multerFile] },
      });

      await createRpcHandler({ context: { request }, operations });

      const { params } = mockUpload.mock.calls[0][0];
      expect(params.name).toBe('John');
      expect(params.avatar).toBe(multerFile);
    });

    it('should keep multer fields array when multiple files share the same field', async () => {
      const file1 = { fieldname: 'docs', originalname: 'a.pdf' };
      const file2 = { fieldname: 'docs', originalname: 'b.pdf' };
      const request = makeExpressRequest({
        body: { entity: 'user', operation: 'upload', params: '{}' },
        files: { docs: [file1, file2] },
      });

      await createRpcHandler({ context: { request }, operations });

      const { params } = mockUpload.mock.calls[0][0];
      expect(params.docs).toEqual([file1, file2]);
    });

    it('should merge nested files using dot-notation fieldname', async () => {
      const multerFile = { fieldname: 'documents.resume', originalname: 'resume.pdf' };
      const request = makeExpressRequest({
        body: { entity: 'user', operation: 'upload', params: JSON.stringify({ name: 'John' }) },
        files: [multerFile],
      });

      await createRpcHandler({ context: { request }, operations });

      const { params } = mockUpload.mock.calls[0][0];
      expect(params.documents.resume).toBe(multerFile);
    });

    it('should fall through to req.body as-is for JSON content-type', async () => {
      const request = makeExpressRequest({
        headers: { 'content-type': 'application/json' },
        body: { entity: 'user', operation: 'get', params: { id: 99 } },
      });

      await createRpcHandler({ context: { request }, operations });

      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ params: { id: 99 } }),
      );
    });
  });

  describe('hooks', () => {
    it('should call preCall and postCall hooks on success', async () => {
      const preCall = jest.fn();
      const postCall = jest.fn();
      const request = makeJsonRequest({ entity: 'user', operation: 'get', params: {} });

      await createRpcHandler({ context: { request }, operations, hooks: { preCall, postCall } });

      expect(preCall).toHaveBeenCalledTimes(1);
      expect(postCall).toHaveBeenCalledTimes(1);
    });

    it('should call error hook and errorHandler on failure', async () => {
      const error = new Error('handler failed');
      const failOperations = { user: { get: jest.fn().mockRejectedValue(error) } };
      const errorHook = jest.fn();
      const errorHandler = jest.fn().mockReturnValue(new Response('custom', { status: 422 }));

      const request = makeJsonRequest({ entity: 'user', operation: 'get', params: {} });

      await expect(
        createRpcHandler({
          context: { request },
          operations: failOperations,
          hooks: { error: errorHook },
          errorHandler,
        }),
      ).rejects.toBeInstanceOf(Response);

      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(errorHook).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'user', operation: 'get' }),
        expect.any(Number),
        error,
      );
      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should throw generic 500 when no errorHandler is provided', async () => {
      const failOperations = { user: { get: jest.fn().mockRejectedValue(new Error('boom')) } };
      const request = makeJsonRequest({ entity: 'user', operation: 'get', params: {} });

      try {
        await createRpcHandler({ context: { request }, operations: failOperations });
      } catch (e: any) {
        expect(e.status).toBe(500);
      }
    });
  });
});
