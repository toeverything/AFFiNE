import type { OnboardingBlockOption } from '../types';
import embed1png from './assets/article-2-embed-1.png';
import illustration1png from './assets/article-2-illustration-1.jpg';
import illustration2png from './assets/article-2-illustration-2.jpg';
import note1png from './assets/article-2-note-1.png';
import note2png from './assets/article-2-note-2.png';
import { BlogLink } from './blog-link';

export const article2: Array<OnboardingBlockOption> = [
  {
    children: <h1>Learning with retrieval practice</h1>,
    offset: { x: -824, y: 0 },
  },
  {
    bg: '#DFF4E8',
    children: (
      <h2>
        Are there any specific techniques to make the process of learning more
        effective?
      </h2>
    ),
    offset: { x: -800, y: 100 },
  },

  {
    bg: '#DFF4E8',
    children: (
      <>
        <p>
          Students often re-read, underline, or highlight materials, thinking
          that it will help them learn better. But, the best method for really
          turning information into long-term memory is to use what is called
          ‘retrieval practice’.
        </p>
        <img
          className="illustration"
          draggable={false}
          width="100%"
          src={illustration1png}
        />
        <p>
          It simply means trying to retrieve the information from your own
          brain, instead of looking at a sheet of paper. When you have really
          learnt something, you’ve created sets of links between the neurons in
          long-term memory. Each time you tug on those sets of links and bring
          them back to mind from your memory, you strengthen them. This is why,
          using flashcards, teaching others, or trying to retrieve key ideas
          from your own mind, after having glanced at a page or your notes, can
          be valuable.
        </p>
      </>
    ),
    offset: { x: -800, y: 100 },
  },

  {
    bg: '#FFF4D8',
    children: <h2>How can a student learn more effectively?</h2>,
    offset: { x: 100, y: -300 },
  },

  {
    bg: '#FFF4D8',
    children: (
      <>
        <p>
          The best method for more efficient learning is to avoid multitasking.
          The Pomodoro Technique helps with this. To do a Pomodoro, just put
          away all distractions (no pop-upson your computer or dings from your
          phone!), set a timer for 25 minutes, and focus as fully as you can for
          those 25 minutes, bringing your thoughts back to the task if you find
          them wandering. At the end of the 25 minutes, give yourself a
          five-minutes break and do not indulge in anything where you have to
          focus on (no checking e-mails, for example – but making a cup of tea
          is just fine). Repeat the Pomodoro/break three or four times, and
          then, take a 30-minutes break – or wrap your studies up for the day!
        </p>
        <img
          className="illustration"
          draggable={false}
          width="100%"
          src={illustration2png}
        />
      </>
    ),
    offset: { x: 100, y: -300 },
  },

  {
    bg: '#DFF4F3',
    children: (
      <>
        <h2>How can students remember more and forget less?</h2>
        <p>
          We all wish we had much better memories, but, if you remember too
          perfectly, it makes it harder to revisit and update your learning – to
          be more flexible on the face of new information, or to change and
          adapt if you’ve got something wrong. If you want to remember more,
          retrieval practice with spaced repetition, that is, spacing your
          retrieval practice out over a number of days – is your best bet.
          Researchers sug-gest that you should retrieve the information when you
          are about to forget it, which is a tricky bit of timing to figure out.
        </p>
        <h2>How can we make online learning more effective for students?</h2>
        <p>
          It can be hard to write a textbook for a class; so, most professors
          use professional textbooks to supplement their teachings. Similarly,
          it can be hard to create high-quality video materials. I believe
          online teaching will continue to become more common post-COVID – the
          genie is out of the bottle as, now, students realise that online
          learning can be more convenient than face-to-face classes. But,
          students still like their teachers – real professors, who they can
          interact with. So, real face-to-face instructors will always have a
          place.
        </p>
      </>
    ),
    offset: { x: -750, y: -530 },
  },

  {
    bg: '#F3F0FF',
    children: (
      <>
        <h2>
          Do you think students should use social media, like YouTube, for
          learning?
        </h2>
        <p>
          There are some excellent learning materials available on YouTube, but,
          students may have to spend a lot of time wading through the dreck to
          find what they are looking for. Students – and all of us – need to be
          a little wary of spending too much time on social media. It can be the
          equivalent of parking yourself in front of the television and
          indulging in hours of mindless entertainment – except that social
          media can also be an echo chamber that can push us to unwittingly
          become more extreme in our beliefs.
        </p>
        <BlogLink />
      </>
    ),
    offset: { x: 150, y: -680 },
  },

  {
    children: <img draggable={false} width={380} src={embed1png} />,
    edgelessOnly: true,
    position: { x: -200, y: -50 },
    fromPosition: { x: 300, y: -300 },
  },

  {
    children: <img draggable={false} width={309} src={note1png} />,
    edgelessOnly: true,
    position: { x: -260, y: -70 },
    fromPosition: { x: -360, y: -100 },
    enterDelay: 300,
    customStyle: {
      page: {
        transform: 'rotate(-10deg) translateY(-100px)',
      },
    },
  },

  {
    children: <img draggable={false} width={1800} src={note2png} />,
    edgelessOnly: true,
    position: { x: 50, y: 0 },
    fromPosition: { x: 2000, y: -2000 },
  },
];
