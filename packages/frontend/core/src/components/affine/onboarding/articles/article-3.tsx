import type { OnboardingBlockOption } from '../types';
import bookmark1png from './assets/article-3-bookmark-1.png';
import illustration1jpg from './assets/article-3-illustration-1.jpg';
import illustration2jpg from './assets/article-3-illustration-2.jpg';
import illustration3jpg from './assets/article-3-illustration-3.jpg';
import illustration4jpg from './assets/article-3-illustration-4.jpg';
import illustration5jpg from './assets/article-3-illustration-5.jpg';
import { BlogLink } from './blog-link';

export const article3: Array<OnboardingBlockOption> = [
  {
    children: (
      <img
        className="illustration"
        draggable={false}
        width={290}
        src={illustration5jpg}
      />
    ),
    edgelessOnly: true,
    position: { x: -780, y: 216 },
    fromPosition: { x: -1500, y: 216 },
    enterDelay: 200,
  },

  {
    children: <img draggable={false} width={450} src={bookmark1png} />,
    edgelessOnly: true,
    position: { x: 500, y: 200 },
    fromPosition: { x: 1000, y: -200 },
    enterDelay: 200,
    leaveDelay: 100,
  },

  {
    children: <h1>Breath of the Wild: Redefining Game Design</h1>,
    offset: { x: -400, y: 0 },
    customStyle: {
      edgeless: { whiteSpace: 'nowrap' },
    },
  },
  {
    bg: '#E1EFFF',
    children: (
      <>
        <h2>Introduction</h2>
        <p>
          At GDC 2017, Hidemaro Fujibayashi, Satoru Takizawa, and Takuhiro Dohta
          from Nintendo shared their insights on The Legend of Zelda: Breath of
          the Wild&apos;s groundbreaking game mechanics. One standout feature is
          the &quot;multiplicative gameplay,&quot; which empowers players to
          interact with the game world in diverse ways, leading to surprising
          outcomes.
        </p>

        <h2>Mechanics</h2>
        <p>
          Multiplicative gameplay works like a magical concoction, where
          players&apos; actions, terrain, and items combine to create a range of
          unexpected results. For instance, players can set trees ablaze to
          create a fiery barrier against enemies, detonate bombs to carve new
          paths, or soar through the skies with a glider for a bird&apos;s-eye
          view of the world.
        </p>
        <p>
          To achieve multiplicative gameplay, the development team made
          significant changes to the game&apos;s terrain system, physics system,
          and action system.
        </p>
      </>
    ),
    offset: { x: -400, y: 0 },
  },

  {
    bg: '#F5F5F5',
    children: (
      <>
        <h2>Terrain</h2>
        <p>
          The terrain system enables players to climb any surface, whether
          it&apos;s a wall, a tree, or a rock, granting them the freedom to
          explore every nook and cranny of the game world.
        </p>
        <img
          className="illustration"
          draggable={false}
          width="100%"
          src={illustration1jpg}
        />
      </>
    ),
    offset: { x: 480, y: -250 },
  },

  {
    bg: '#FFEACA',
    children: (
      <>
        <h2>Physics</h2>
        <p>
          Unlike traditional games, the physics system in Breath of the Wild is
          more open, allowing players to leverage natural phenomena to solve
          puzzles or create new gameplay opportunities. For instance, players
          can ignite trees to create barriers of fire or use bombs to open up
          new pathways.
        </p>
        <img
          className="illustration"
          draggable={false}
          width="100%"
          src={illustration2jpg}
        />
      </>
    ),
    offset: { x: -500, y: -400 },
  },

  {
    bg: '#DFF4E8',
    children: (
      <>
        <h2>Action</h2>
        <p>
          The action system offers more flexibility than in traditional games,
          empowering players to choose how they want to interact with the game
          world. Whether it&apos;s wielding a sword, a shield, or a bow and
          arrow, players have the freedom to approach challenges in their own
          unique way.
        </p>
        <img
          className="illustration"
          draggable={false}
          width="100%"
          src={illustration3jpg}
        />
      </>
    ),
    offset: { x: 400, y: -700 },
  },

  {
    bg: '#FFE1E1',
    children: (
      <>
        <h2>Validation</h2>
        <p>
          Takizawa also outlined the process for validating multiplicative
          gameplay. He believes that it can be achieved through the following
          steps:
        </p>
        <img
          className="illustration"
          draggable={false}
          width="100%"
          src={illustration4jpg}
        />
        <p>
          List all possible behaviors, terrain features, and items. For example,
          in Breath of the Wild, players can engage in activities such as
          climbing, gliding, swimming, and combat; terrain includes mountains,
          forests, plains, and lakes; and items encompass weapons, tools, and
          food.
        </p>
        <p>
          Analyze the interactions between these elements. For example, players
          can use fire to ignite trees, creating a barrier of fire to impede
          enemies&apos; progress.
        </p>
        <p>
          Test the results of these interactions. For example, the development
          team can assess whether players can safely navigate through a wall of
          fire.
        </p>
        <p>
          By following these steps, developers can verify whether multiplicative
          gameplay will yield the desired outcomes.
        </p>
      </>
    ),
    offset: { x: -440, y: -870 },
  },

  {
    bg: '#F3F0FF',
    children: (
      <>
        <h2>Conclusion</h2>
        <p>
          Multiplicative gameplay is a potent tool for crafting more captivating
          and immersive gaming experiences. It empowers players to explore the
          game world in creative and flexible ways, leading to fresh and
          unexpected discoveries.
        </p>
        <BlogLink />
      </>
    ),
    offset: { x: 450, y: -1400 },
  },
];
