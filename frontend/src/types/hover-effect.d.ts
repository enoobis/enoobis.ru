declare module "hover-effect" {
  type HoverEffectOptions = {
    parent: HTMLElement;
    image1: string;
    image2: string;
    displacementImage: string;
    intensity?: number;
    imagesRatio?: number;
  };

  export default function hoverEffect(options: HoverEffectOptions): {
    destroy: () => void;
  };
}
