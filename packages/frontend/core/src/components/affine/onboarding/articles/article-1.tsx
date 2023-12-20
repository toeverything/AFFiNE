import clsx from 'clsx';

import { CounterNote } from '../switch-widgets/counter-note';
import { PageLink } from '../switch-widgets/page-link';
import type { OnboardingBlockOption } from '../types';
import bookmark1png from './assets/article-1-bookmark-1.png';
import illustration1png from './assets/article-1-illustration-1.png';
import Article1Illustration2 from './assets/article-1-illustration-2';
import { hr, link, quote } from './blocks.css';
import { BlogLink } from './blog-link';

export const article1: Array<OnboardingBlockOption> = [
  {
    children: <h1>This is Local-first software</h1>,
    offset: { x: -600, y: 0 },
  },
  {
    bg: '#F5F5F5',
    children: (
      <>
        <h2>Local-first software</h2>
        <h3>You own your data, in spite of the cloud</h3>
        <p>
          Cloud apps like <a className={link}>Google Docs</a> and{' '}
          <a className={link}>Trello</a> are popular because they enable
          real-time collaboration with colleagues, and they make it easy for us
          to access our work from all of our devices. However, by centralizing
          data storage on servers, cloud apps also take away ownership and
          agency from users.{' '}
          <b>
            If a service shuts down, the software stops functioning, and data
            created with that software is lost.
          </b>
        </p>
      </>
    ),
    offset: { x: -570, y: 80 },
    sub: {
      children: (
        <CounterNote
          index={1}
          width={500}
          label="Cloud apps enable collaboration but can jeopardize data ownership; time varies."
          animationDelay={300}
          color="#E660A4"
        />
      ),
      edgelessOnly: true,
      enterDelay: 300,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    bg: '#F3F0FF',
    children: (
      <>
        <img draggable={false} width="100%" src={bookmark1png} />
        <p className={clsx(quote)}>
          If you are an entrepreneur interested in building developer
          infrastructure, all of the above suggests an interesting market
          opportunity: “Firebase for CRDTs.”
        </p>
        <p>
          In this article we propose <PageLink>local-first software</PageLink>{' '}
          of principles for software that enables both collaboration
        </p>
      </>
    ),
    offset: { x: -570, y: 200 },
    sub: {
      children: (
        <CounterNote
          index={2}
          width={300}
          label="Local-first software emphasizes collaboration, ownership, and data control for users."
          animationDelay={600}
          color="#E660A4"
        />
      ),
      edgelessOnly: true,
      enterDelay: 600,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    bg: '#DFF4F3',
    children: (
      <>
        <p>
          We survey existing approaches to data storage and sharing, ranging
          from email attachments to web apps to Firebase-backed mobile apps, and
          we examine the trade-offs of each. We look at Conflict-free Replicated
          Data Types (CRDTs): data structures that are multi-user from the
          ground up while also being fundamentally local and private. CRDTs have
          the potential to be a foundational technology for realizing
          local-first software.
        </p>
        <hr className={hr} />
        <p>
          We share some of our findings from developing local-first software
          prototypes at <a className={link}>Ink & Switch</a> over the course of
          several years. These experiments test the viability of CRDTs in
          practice, and explore the user interface challenges for this new data
          model. Lastly, we suggest some next steps for moving towards
          local-first software: for researchers, for app developers, and a
          startup opportunity for entrepreneurs.
        </p>
      </>
    ),
    offset: { x: 290, y: -140 },
    sub: {
      children: (
        <CounterNote
          index={3}
          width={300}
          label="Examining data storage, CRDTs' role, prototypes, and future possibilities."
          animationDelay={900}
          color="#E660A4"
        />
      ),
      edgelessOnly: true,
      enterDelay: 900,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    bg: '#FFF4D8',
    children: (
      <>
        <p>
          This article has also been <a className={link}>published in PDF</a>{' '}
          format in the proceedings of the{' '}
          <a className={link}>Onward! 2019 conference</a>. Please cite it as:
        </p>
        <p className={clsx(quote)}>
          Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, and Mark
          McGranaghan. Local-first software: you own your data, in spite of the
          cloud. 2019 ACM SIGPLAN International Symposium on New Ideas, New
          Paradigms, and Reflections on Programming and Software (Onward!),
          October 2019, pages 154–178.{' '}
          <a className={link}>doi:10.1145/3359591.3359737</a>
        </p>

        <p>
          We welcome your feedback: <a className={link}>@inkandswitch</a> or
          <a className={link}>hello@inkandswitch.com</a>.
        </p>
      </>
    ),
    offset: { x: 350, y: -850 },
  },

  {
    bg: '#E1EFFF',
    children: (
      <>
        <h2>Contents</h2>
        <h3>
          Motivation: collaboration and ownership.
          <br />
          Seven ideals for local-first software
        </h3>

        <ol>
          <li>No spinners: your work at your fingertips</li>
          <li>
            <a className={link}>Your work is not trapped on one device</a>
          </li>
          <li>
            <PageLink>The network is optional</PageLink>
          </li>
          <li>Seamless collaboration with your colleagues</li>
          <li>
            <PageLink>The Long Now</PageLink>
          </li>
          <li>Security and privacy by default</li>
          <li>You retain ultimate ownership and control</li>
        </ol>

        <h3>Existing data storage and sharing models</h3>
        <ul>
          <li>How application architecture affects user experience</li>
          <li>Developer infrastructure for building apps</li>
        </ul>

        <h3>Towards a better future</h3>
        <ul>
          <li>CRDTs as a foundational technology</li>
          <li>Ink & Switch prototypes</li>
          <li>How you can help</li>
        </ul>

        <h3>Conclusions</h3>
        <ul>
          <li>Acknowledgments</li>
        </ul>
      </>
    ),
    offset: { x: 300, y: -250 },
    customStyle: { edgeless: { width: 500 } },
    sub: {
      children: (
        <CounterNote
          index={4}
          width={400}
          label="Motivation, ideals, existing models, architecture, CRDTs, prototypes, future, help, conclusions."
          animationDelay={1200}
          color="#E660A4"
        />
      ),
      edgelessOnly: true,
      enterDelay: 1200,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    bg: '#FFE1E1',
    children: (
      <>
        <h3>Motivation: collaboration and ownership</h3>
        <p>
          It’s amazing how easily we can collaborate online nowadays. We use
          Google Docs to collaborate on documents, spreadsheets and
          presentations; in Figma we work together on user interface designs; we
          communicate with colleagues using Slack; we track tasks in Trello; and
          so on. We depend on these and many other online services, e.g. for
          taking notes, planning projects or events, remembering contacts, and a
          whole raft of business uses.
        </p>
        <p>
          Today’s cloud apps offer big benefits compared to earlier generations
          of software: seamless collaboration, and being able to access data
          from any device. As we run more and more of our lives and work through
          these cloud apps, they become more and more critical to us. The more
          time we invest in using one of these apps, the more valuable the data
          in it becomes to us.
        </p>
        <p>
          However, in our research we have spoken to a lot of creative
          professionals, and in that process we have also learned about the
          downsides of cloud apps.
        </p>
        <p>
          When you have put a lot of creative energy and effort into making
          something, you tend to have a deep emotional attachment to it. If you
          do creative work, this probably seems familiar. (When we say “creative
          work,” we mean not just visual art, or music, or poetry — many other
          activities, such as explaining a technical topic, implementing an
          intricate algorithm, designing a user interface, or figuring out how
          to lead a team towards some goal are also creative efforts.)
        </p>
        <BlogLink />
      </>
    ),
    offset: { x: 900, y: -950 },
    sub: {
      children: (
        <CounterNote
          index={5}
          width={400}
          label="Online collaboration's benefits but emotional attachment and downsides discussed."
          animationDelay={1500}
          color="#E660A4"
        />
      ),
      edgelessOnly: true,
      enterDelay: 1500,
      position: {},
      style: { bottom: 'calc(100% + 20px)', left: -40 },
    },
  },

  {
    children: <img width={784} draggable={false} src={illustration1png} />,
    edgelessOnly: true,
    position: { x: -600, y: 1000 },
    fromPosition: { x: -1000, y: 1500 },
    enterDelay: 250,
  },

  {
    children: <Article1Illustration2 />,
    edgelessOnly: true,
    position: { x: 1200, y: 500 },
    fromPosition: { x: 1800, y: -100 },
    enterDelay: 200,
  },
];
