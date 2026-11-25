import { pickTouchVideo } from './pick-touch-video';

const FILES = ['M1103.mp4', 'M1103(1).mp4', '01023 Y1. 01023 Y2. 01023 Y4.mp4', 'С1183B.mp4'];

describe('pickTouchVideo', () => {
  it('finds the newest video for the article written in a note', () => {
    expect(pickTouchVideo({ noteTexts: ['m1103'], fileNames: FILES })).toEqual({ status: 'found', article: 'm1103', fileName: 'M1103(1).mp4' });
  });

  it('skips notes that are sentences and uses the one that is an article', () => {
    const noteTexts = ['Клієнтка просила передзвонити після обіду', '01023 Y2', 'Оплата в п\'ятницю'];
    expect(pickTouchVideo({ noteTexts, fileNames: FILES }).fileName).toBe('01023 Y1. 01023 Y2. 01023 Y4.mp4');
  });

  it('takes the newest note that has a video when an older article note has none', () => {
    expect(pickTouchVideo({ noteTexts: ['X9999', 'C1183B'], fileNames: FILES }).fileName).toBe('С1183B.mp4');
  });

  it('says the video is missing when an article is written but the folder has no file', () => {
    expect(pickTouchVideo({ noteTexts: ['X9999'], fileNames: FILES })).toEqual({ status: 'no-video', article: 'X9999', fileName: null });
  });

  it('says there is no article when no note looks like one', () => {
    expect(pickTouchVideo({ noteTexts: ['Просила зателефонувати', ''], fileNames: FILES })).toEqual({ status: 'no-article', article: null, fileName: null });
    expect(pickTouchVideo({ noteTexts: [], fileNames: FILES }).status).toBe('no-article');
  });
});
