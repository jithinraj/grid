import React, { memo, useEffect } from "react";
import { RendererProps } from "./Grid";
import { Group, Rect, Text, Shape } from "react-konva";
import { KonvaEventObject } from "konva/types/Node";

export interface CellProps extends RendererProps {
  value?: string;
  textColor?: string;
  padding?: number;
  onClick?: (e: KonvaEventObject<MouseEvent>) => void;
}

/**
 * Default cell component
 * @param props
 */
const Cell: React.FC<CellProps> = memo((props) => {
  const {
    x,
    y,
    width,
    height,
    value,
    fill = "white",
    strokeWidth = 0.5,
    stroke = "#aaa",
    align = "center",
    verticalAlign = "middle",
    textColor = "#333",
    padding = 5,
    fontFamily = "Arial, sans-serif",
    fontSize = 12,
    onClick,
    children,
  } = props;
  return (
    <>
      <Shape
        x={x}
        y={y}
        height={height}
        width={width}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        shadowForStrokeEnabled={false}
        sceneFunc={(context, shape) => {
          context.beginPath();
          context.rect(0, 0, shape.getAttr("width"), shape.getAttr("height"));
          context.closePath();
          context.fillStrokeShape(shape);
        }}
      />
      <Shape
        strokeWidth={0}
        hitStrokeWidth={0}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        x={x}
        y={y}
        height={height}
        width={width}
        sceneFunc={(context) => {
          // @ts-ignore
          context.font = `${fontSize}px ${fontFamily}`;
          context.fillText(
            value === void 0 ? "" : value,
            padding,
            (height || 0) - padding
          );
        }}
      />
    </>
  );
});

/**
 * Default CellRenderer
 * @param props
 */
const CellRenderer = (props: RendererProps) => {
  return <Cell {...props} />;
};

export default CellRenderer;
export { CellRenderer, Cell };
