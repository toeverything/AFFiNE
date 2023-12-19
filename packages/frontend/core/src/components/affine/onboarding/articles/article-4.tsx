import { ShadowSticker } from '../switch-widgets/shadow-sticker';
import type { OnboardingBlockOption } from '../types';
import bookmark1png from './assets/article-4-bookmark-1.png';
import bookmark2png from './assets/article-4-bookmark-2.png';
import illustration1jpg from './assets/article-4-illustration-1.jpg';
import illustration2jpg from './assets/article-4-illustration-2.jpg';
import { BlogLink } from './blog-link';

export const article4: Array<OnboardingBlockOption> = [
  {
    children: <h1>More Is Different</h1>,
    offset: { x: -430, y: 0 },
  },
  {
    bg: '#FFEACA',
    offset: { x: -400, y: 0 },
    children: (
      <>
        <h2>
          Broken symmetry and the nature of the hierarchical structure of
          science
        </h2>
        <img draggable={false} width="100%" src={bookmark1png} />
        <p>
          The reductionist hypothesis may still be a topic for controversy among
          philosophers, but among the great majority of active scientists I
          think it is accepted without questions. The workings of our minds and
          bodies, and of all the animate or inanimate matter of which we have
          any detailed knowledge, are assumed to be controlled by the same set
          of fundamental laws, which except under certain extreme conditions we
          feel we know pretty well.
        </p>
        <p>
          It seems inevitable to go on uncritically to what appears at first
          sight to be an obvious corollary of reductionism: that if everything
          obeys the same fundamental laws, then the only scientists who are
          studying anything really fundamental are those who are working on
          those laws. In practice, that amounts to some astrophysicists, some
          elementary particle physicists, some logicians and other
          mathematicians, and few others. This point of view, which it is the
          main purpose of this article to oppose, is expressed in a rather
          well-known passage by Weisskopf (1):
        </p>
      </>
    ),
    sub: {
      children: (
        <ShadowSticker width={300}>
          Reductionist hypothesis accepted by most scientists, fundamental laws
          in focus.
        </ShadowSticker>
      ),
      edgelessOnly: true,
      position: {},
      style: {
        right: -20,
        bottom: '100%',
        transformOrigin: '100% 100%',
      },
      customStyle: {
        page: { transform: 'scale(0)' },
        edgeless: {},
      },
      enterDelay: 200,
      leaveDelay: 100,
    },
  },

  {
    bg: '#DFF4F3',
    offset: { x: 500, y: -490 },
    children: (
      <p>
        Looking at the development of science in the Twentieth Century one can
        distinguish two trends, which I will call “intensive” and “extensive”
        research, lacking a better terminology. In short: intensive research
        goes for the fundamental laws, extensive research goes for the
        explanation of phenomena in terms of known fundamental laws, As always,
        distinctions of this kind are not unambiguous, but they are clear in
        most cases. Solid state physics plasma physics, and perhaps also biology
        are extensive. High energy physics and a good part of nuclear physics
        are intensive research going on than extensive. Once new fundamental
        laws are discovered, a large and ever increasing activity begins in
        order to apply the discoveries to hitherto unexplained phenomena. Thus,
        there are two dimensions to basic research. The frontier of science
        extends all along a long line from the newest and most modern intensive
        research, over the extensive research recently spawned by the intensive
        research of yesterday, to the broad and well developed web of extensive
        research activities based on intensive research of past decades
      </p>
    ),
    sub: {
      children: (
        <ShadowSticker width={300}>
          Twentieth Century science: intensive vs. extensive research,
          fundamental laws&apos; impact.
        </ShadowSticker>
      ),
      position: {},
      style: {
        left: 'calc(100% - 50px)',
        bottom: '0px',
        transformOrigin: '0% 50%',
      },
      customStyle: {
        page: { transform: 'scale(0)' },
        edgeless: {},
      },
      enterDelay: 300,
      leaveDelay: 100,
    },
  },

  {
    bg: '#E1EFFF',
    offset: { x: -800, y: -280 },
    children: (
      <>
        <p>
          The effectiveness of this message may be indicated by the face that I
          heard it quoted recently by a leader in the field of materials
          science, who urged the participants at a meeting dedicated to
          “fundamental problems in condensed matter physics” to accept that
          there were few or no such problems and that nothing was left but
          extensive science, which he seemed to equate with device engineering.
        </p>
        <p>
          The main fallacy in this kind of thinking is that the reductionist
          hypothesis does not by any means imply a “constructions” one: The
          ability to reduce everything to simple fundamental laws does not imply
          the ability to start from those laws and reconstruct the universe. In
          fact, the more the elementary particle physicists tell us about the
          nature of the fundamental laws, the less relevance they seem to have
          to the very real problems of the rest of science much less to those of
          society.
        </p>
      </>
    ),
    sub: {
      children: (
        <ShadowSticker width={336}>
          Misunderstanding: Reductionism doesn&apos;t mean reconstructing
          complex phenomena from fundamentals.
        </ShadowSticker>
      ),
      position: {},
      style: {
        top: 'calc(100% - 30px)',
        left: 'calc(100% - 250px)',
        transformOrigin: '0 0',
      },
      customStyle: {
        page: { transform: 'scale(0)' },
        edgeless: {},
      },
      enterDelay: 400,
      leaveDelay: 100,
    },
  },

  {
    bg: '#FFE1E1',
    offset: { x: 580, y: -680 },
    children: (
      <>
        <p>
          The constructionist hypothesis breaks down when confronted with the
          twin difficulties of scale and complexity. The behavior of large and
          complex aggregates of elementary particles, it turns out, is not to be
          understood in terms of a simple extrapolation entirely new properties
          appear, and the understanding of the new behaviors requires research
          which I think is as fundamental in its nature as any other. That is,
          it seems to me that one may array the sciences roughly linearly in a
          hierarchy, according to the idea: The elementary entities of science X
          obey the laws of science Y.
        </p>
        <p>
          But this hierarchy does not imply that science X is “just applied Y.”
          At each stage entirely new laws, concepts and generalizations are
          necessary, requiring inspiration and creativity to just as great a
          degree as in the previous one. Psychology is not applied biology, nor
          is biology applied chemistry.
        </p>
        <BlogLink />
      </>
    ),

    sub: {
      children: (
        <ShadowSticker width={463}>
          Complex systems introduce new properties, demanding fundamental
          research beyond reductionism.
        </ShadowSticker>
      ),
      edgelessOnly: true,
      position: {},
      style: {
        bottom: '100%',
        left: '-100px',
        transformOrigin: '0% 100%',
      },
      customStyle: {
        page: { transform: 'scale(0)' },
        edgeless: {},
      },
      enterDelay: 500,
      leaveDelay: 100,
    },
  },

  //
  {
    children: <img draggable={false} width={500} src={bookmark2png} />,
    edgelessOnly: true,
    position: { x: 0, y: 760 },
  },

  {
    children: (
      <img
        className="illustration"
        draggable={false}
        width={322}
        src={illustration1jpg}
      />
    ),
    edgelessOnly: true,
    position: { x: -820, y: 150 },
    fromPosition: { x: -1800, y: 150 },
    enterDelay: 200,
    leaveDelay: 200,
    sub: {
      children: (
        <img
          className="illustration"
          draggable={false}
          width={213}
          src={illustration2jpg}
        />
      ),
      edgelessOnly: true,
      position: {},
      style: {
        top: 'calc(100% - 40px)',
        left: 'calc(100% - 250px)',
      },
    },
  },
];
