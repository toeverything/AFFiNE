import { CounterNote } from '../switch-widgets/counter-note';
import type { OnboardingBlockOption } from '../types';
import bookmark1png from './assets/article-0-bookmark-1.png';
import bookmark2png from './assets/article-0-bookmark-2.png';
import embed1png from './assets/article-0-embed-1.png';
import { BlogLink } from './blog-link';

export const article0: Array<OnboardingBlockOption> = [
  {
    children: <h1>HOWTO: Be more productive</h1>,
    offset: { x: -150, y: 0 },
  },
  {
    bg: '#f5f5f5',
    children: (
      <>
        <p>
          “With all the time you spend watching TV,” he tells me, “you could
          have written a novel by now.” It’s hard to disagree with the sentiment
          — writing a novel is undoubtedly a better use of time than watching TV
          — but what about the hidden assumption? Such comments imply that time
          is “fungible” — that time spent watching TV can just as easily be
          spent writing a novel. And sadly, that’s just not the case.
        </p>
        <p>
          Time has various levels of quality. If I’m walking to the subway
          station and I’ve forgotten my notebook, then it’s pretty hard for me
          to write more than a couple paragraphs. And it’s tough to focus when
          you keep getting interrupted. There’s also a mental component:
          sometimes I feel happy and motivated and ready to work on something,
          but other times I feel so sad and tired I can only watch TV.
        </p>
      </>
    ),
    offset: { x: -120, y: 80 },
    sub: {
      children: (
        <CounterNote
          index={1}
          width={290}
          label="Time isn't interchangeable; it varies in quality due to circumstances and mental states."
          animationDelay={300}
          color="#6E52DF"
        />
      ),
      enterDelay: 300,
      position: {},
      style: {
        bottom: 'calc(100% + 20px)',
        left: -40,
      },
      edgelessOnly: true,
    },
  },
  {
    bg: '#F9E8FF',
    children: (
      <>
        <img draggable={false} width="100%" src={bookmark1png} />
        <p>
          If you want to be more productive then, you have to recognize this
          fact and deal with it. First, you have to make the best of each kind
          of time. And second, you have to try to make your time higher-quality.
        </p>
        <h3>Spend time efficiently</h3>
      </>
    ),
    offset: { x: 250, y: 100 },
  },

  {
    bg: '#E1EFFF',
    children: (
      <>
        <h2>Choose good problems</h2>
        <p>
          Life is short (or so I’m told) so why waste it doing something dumb?
          It’s easy to start working on something because it’s convenient, but
          you should always be questioning yourself about it. Is there something
          more important you can work on? Why don’t you do that instead? Such
          questions are hard to face up to (eventually, if you follow this rule,
          you’ll have to ask yourself why you’re not working on the most
          important problem in the world) but each little step makes you more
          productive.
        </p>
        <p>
          <em style={{ background: '#ADF8E9' }}>
            This isn’t to say that all your time should be spent on the most
            important problem in the world. Mine certainly isn’t (after all, I’m
            writing this essay). But it’s definitely the standard against which
            I measure my life.
          </em>
        </p>
      </>
    ),
    offset: { x: -600, y: -130 },
    sub: {
      children: (
        <CounterNote
          index={2}
          width={290}
          label="Prioritize, question, and work towards productivity."
          animationDelay={800}
          color="#6E52DF"
        />
      ),
      edgelessOnly: true,
      enterDelay: 800,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    bg: '#DFF4E8',
    children: (
      <>
        <h2>Have a bunch of them</h2>
        <p>
          Another common myth is that you’ll get more done if you pick one
          problem and focus on it exclusively. I find this is hardly ever true.
          Just this moment for example, I’m trying to fix my posture, exercise
          some muscles, drink some fluids, clean off my desk, IM with my
          brother, and write this essay. Over the course the day, I’ve worked on
          this essay, read a book, had some food, answered some email, chatted
          with friends, done some shopping, worked on a couple other essays,
          backed up my hard drive, and organized my book list. In the past week
          I’ve worked on several different software projects, read several
          different books, studied a couple different programming languages,
          moved some of my stuff, and so on.
        </p>
        <p>
          Having a lot of different projects gives you work for different
          qualities of time. Plus, you’ll have other things to work on if you
          get stuck or bored (and that can give your mind time to unstick
          yourself).
        </p>
        <p>
          It also makes you more creative. Creativity comes from applying things
          you learn in other fields to the field you work in. If you have a
          bunch of different projects going in different fields, then you have
          many more ideas you can apply.
        </p>
      </>
    ),
    offset: { x: -50, y: -50 },
    sub: {
      children: (
        <CounterNote
          index={3}
          width={290}
          label="Diverse tasks enhance productivity, creativity, and combat boredom effectively."
          animationDelay={1200}
          color="#6E52DF"
        />
      ),
      edgelessOnly: true,
      enterDelay: 1200,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    bg: '#DFF4F3',
    children: (
      <>
        <h2>Make a list</h2>
        <p>
          Coming up with a bunch of different things to work on shouldn’t be
          hard — most people have tons of stuff they want to get done. But if
          you try to keep it all in your head it quickly gets overwhelming. The
          psychic pressure of having to remember all of it can make you crazy.
          The solution is again simple: write it down.
        </p>
        <p>
          Once you have a list of all the things you want to do, you can
          organize it by kind. For example, my list is programming, writing,
          thinking, errands, reading, listening, and watching (in that order).
        </p>
        <p>
          Most major projects involve a bunch of these different tasks. Writing
          this, for example, involves reading about other procrastination
          systems, thinking up new sections of the article, cleaning up
          sentences, emailing people with questions, and so on, all in addition
          to the actual work of writing the text. Each task can go under the
          appropriate section, so that you can do it when you have the right
          kind of time.
        </p>
      </>
    ),
    offset: { x: 800, y: -400 },
    sub: {
      children: (
        <CounterNote
          index={4}
          width={290}
          label="Organize tasks by category to manage overwhelming to-do lists efficiently."
          animationDelay={1500}
          color="#6E52DF"
        />
      ),
      edgelessOnly: true,
      enterDelay: 1500,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    // children: <Article0Bookmark2 />,
    children: <img draggable={false} width={418} src={bookmark2png} />,
    edgelessOnly: true,
    position: { x: 700, y: 230 },
    fromPosition: { x: 1000, y: 0 },
  },

  {
    bg: '#FFE1E1',
    children: (
      <>
        <h2>Integrate the list with your life</h2>
        <p>
          Once you have this list, the problem becomes remembering to look at
          it. And the best way to remember to look at it is to make looking at
          it what you would do anyway. For example, I keep a stack of books on
          my desk, with the ones I’m currently reading on top. When I need a
          book to read, I just grab the top one off the stack.
        </p>
        <p>
          I do the same thing with TV/movies. Whenever I hear about a movie I
          should watch, I put it in a special folder on my computer. Now
          whenever I feel like watching TV, I just open up that folder.
        </p>
        <p>
          I’ve also thought about some more intrusive ways of doing this. For
          example, a web page that pops up with a list of articles in my “to
          read” folder whenever I try to check some weblogs. Or maybe even a
          window that pops up with work suggestions occasionally for me to see
          when I’m goofing off.
        </p>
        <p>
          Making the best use of the time you have can only get you so far. The
          much more important problem is making more higher quality time for
          yourself. Most people’s time is eaten up by things like school and
          work. Obviously if you attend one of these, you should stop. But what
          else can you do?
        </p>
        <BlogLink />
      </>
    ),
    offset: { x: 1200, y: -1600 },
    sub: {
      children: (
        <CounterNote
          index={5}
          width={290}
          label="Integrate tasks into daily routines, create more high-quality free time."
          animationDelay={1500}
          color="#6E52DF"
        />
      ),
      edgelessOnly: true,
      enterDelay: 1500,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    // children: <Article0Embed1 />,
    children: <img draggable={false} width={450} src={embed1png} />,
    edgelessOnly: true,
    position: { x: 1050, y: 630 },
    fromPosition: { x: 1400, y: 630 },
    enterDelay: 200,
  },
];
