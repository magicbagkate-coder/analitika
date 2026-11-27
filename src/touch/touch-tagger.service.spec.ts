import { TouchTaggerService } from './touch-tagger.service';

function build(tags: string[] | undefined) {
  const getChat = jest.fn().mockResolvedValue({ id: 'c1', tags });
  const updateChat = jest.fn().mockResolvedValue(undefined);
  return { service: new TouchTaggerService({ getChat } as never, { updateChat } as never), getChat, updateChat };
}

describe('TouchTaggerService', () => {
  it('adds the tag and keeps the chat tags it already has', async () => {
    const { service, updateChat } = build(['оценка-4', 'msg-77']);
    await service.tagTouch({ chatId: 'c1', tag: 'касание 1' });

    expect(updateChat).toHaveBeenCalledWith({ chatId: 'c1', tags: ['оценка-4', 'msg-77', 'касание 1'] });
  });

  it('does not touch the chat when the tag is already there', async () => {
    const { service, updateChat } = build(['касание 1']);
    await service.tagTouch({ chatId: 'c1', tag: 'касание 1' });

    expect(updateChat).not.toHaveBeenCalled();
  });

  it('works for a chat that has no tags at all', async () => {
    const { service, updateChat } = build(undefined);
    await service.tagTouch({ chatId: 'c1', tag: 'касание 2' });

    expect(updateChat).toHaveBeenCalledWith({ chatId: 'c1', tags: ['касание 2'] });
  });

  it('only logs when Sitniks refuses, so the touch is not reported as trouble', async () => {
    const { service, updateChat } = build([]);
    updateChat.mockRejectedValueOnce(new Error('403'));

    await expect(service.tagTouch({ chatId: 'c1', tag: 'касание 1' })).resolves.toBeUndefined();
  });
});
