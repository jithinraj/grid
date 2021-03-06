// @ts-nocheck
import React, { useRef, useState, useCallback, useEffect, memo } from "react";
import ReactDOM from "react-dom";
import {
  Grid,
  RendererProps,
  useSelection,
  useEditable,
  useCopyPaste,
  useUndo,
  useSizer,
  GridRef,
  CellInterface,
  Cell,
  getBoundedCells
} from "@rowsncolumns/grid";
import { createPatches } from "@rowsncolumns/grid/dist/hooks/useUndo";
import { Group, Rect, Text } from "react-konva";
import { useMeasure } from "react-use";
import isEqual from "react-fast-compare";
const FormulaParser = require("hot-formula-parser").Parser;
const parser = new FormulaParser();

function number2Alpha(i) {
  return (
    (i >= 26 ? number2Alpha(((i / 26) >> 0) - 1) : "") +
    "abcdefghijklmnopqrstuvwxyz"[i % 26 >> 0]
  );
}

const Header = memo((props: RendererProps) => {
  const {
    x,
    y,
    width,
    height,
    rowIndex,
    columnIndex,
    value,
    columnHeader,
    isActive
  } = props;
  const isCorner = rowIndex === columnIndex;
  const text = isCorner
    ? ""
    : columnHeader
    ? rowIndex
    : number2Alpha(columnIndex - 1).toUpperCase();

  const fill = isActive ? "#E9EAED" : "#F8F9FA";
  return (
    <Cell {...props} value={text} fill={fill} stroke="#999" align="center" />
  );
}, isEqual);

const Sheet = ({ data, onChange, name, isActive }) => {
  const gridRef = useRef<GridRef>();
  const getValueRef = useRef();
  const [containerRef, { width, height }] = useMeasure();
  const rowCount = 1000;
  const columnCount = 1000;
  const getValue = useCallback(
    ({ rowIndex, columnIndex }) => {
      return data[[rowIndex, columnIndex]];
    },
    [data]
  );
  getValueRef.current = getValue;
  const {
    activeCell,
    selections,
    setActiveCell,
    setSelections,
    newSelection,
    ...selectionProps
  } = useSelection({
    gridRef,
    rowCount,
    columnCount,
    onFill: (activeCell, fillSelection) => {
      if (!fillSelection) return;
      const { bounds } = fillSelection;
      const changes = {};
      const previousChanges = {};
      const value = getValueRef.current(activeCell);
      for (let i = bounds.top; i <= bounds.bottom; i++) {
        for (let j = bounds.left; j <= bounds.right; j++) {
          changes[[i, j]] = value;
          previousChanges[[i, j]] = getValue({ rowIndex: i, columnIndex: j });
        }
      }

      addToUndoStack(
        createPatches(["range", activeCell], changes, previousChanges)
      );

      onChange(name, changes);
    }
  });
  const handleUndo = patches => {
    const { path, value } = patches;
    const [key] = path;
    if (key === "data") {
      const [_, { rowIndex, columnIndex }] = path;
      const changes = {
        [[rowIndex, columnIndex]]: value
      };
      onChange(name, changes);
      setActiveCell({ rowIndex, columnIndex });
    }

    if (key === "range") {
      const [_, cell] = path;
      onChange(name, value);
      setActiveCell(cell);
    }
  };
  const {
    undo,
    redo,
    add: addToUndoStack,
    canUndo,
    canRedo,
    ...undoProps
  } = useUndo({
    onUndo: handleUndo,
    onRedo: handleUndo
  });
  useCopyPaste({
    gridRef,
    selections,
    activeCell,
    getValue,
    onPaste: (rows, activeCell) => {
      const { rowIndex, columnIndex } = activeCell;
      const endRowIndex = Math.max(rowIndex, rowIndex + rows.length - 1);
      const endColumnIndex = Math.max(
        columnIndex,
        columnIndex + (rows.length && rows[0].length - 1)
      );
      const changes = {};
      for (const [i, row] of rows.entries()) {
        for (const [j, cell] of row.entries()) {
          changes[[rowIndex + i, columnIndex + j]] = cell;
        }
      }

      addToUndoStack(
        createPatches(
          ["data", activeCell],
          changes[[rowIndex, columnIndex]],
          getValueRef.current(activeCell)
        )
      );

      onChange(name, changes);

      /* Should select */
      if (rowIndex === endRowIndex && columnIndex === endColumnIndex) return;

      setSelections([
        {
          bounds: {
            top: rowIndex,
            left: columnIndex,
            bottom: endRowIndex,
            right: endColumnIndex
          }
        }
      ]);
    },
    onCut: selection => {
      const { bounds } = selection;
      const changes = {};
      for (let i = bounds.top; i <= bounds.bottom; i++) {
        for (let j = bounds.left; j <= bounds.right; j++) {
          changes[[i, j]] = undefined;
        }
      }
      onChange(name, changes);
    }
  });

  useEffect(() => {
    parser.on("callCellValue", (cellCoord, done) => {
      let value = getValueRef.current({
        rowIndex: cellCoord.row.index + 1,
        columnIndex: cellCoord.column.index + 1
      });
      const isFormula = value && value.toString().startsWith("=");
      if (isFormula) {
        value = parser.parse(value.substr(1)).result;
      }
      done(value);
    });
  }, []);
  const { editorComponent, isEditInProgress, ...editableProps } = useEditable({
    gridRef,
    getValue,
    selections,
    activeCell,
    onDelete: (activeCell, selections) => {
      /**
       * It can be a range of just one cell
       */
      if (selections.length) {
        const newValues = selections.reduce((acc, { bounds }) => {
          for (let i = bounds.top; i <= bounds.bottom; i++) {
            for (let j = bounds.left; j <= bounds.right; j++) {
              if (
                getValueRef.current({ rowIndex: i, columnIndex: j }) !==
                undefined
              ) {
                acc[[i, j]] = "";
              }
            }
          }
          return acc;
        }, {});
        onChange(name, newValues);
        gridRef.current.resetAfterIndices(
          {
            rowIndex: selections[0].bounds.top,
            columnIndex: selections[0].bounds.left
          },
          false
        );
      } else {
        onChange(name, { [[activeCell.rowIndex, activeCell.columnIndex]]: "" });
        gridRef.current.resetAfterIndices(activeCell);
      }
    },
    onSubmit: (value, cell, nextActiveCell) => {
      const { rowIndex, columnIndex } = cell;
      const changes = {
        [[rowIndex, columnIndex]]: value
      };
      const previousValue = getValueRef.current(cell);

      addToUndoStack(createPatches(["data", cell], value, previousValue));

      onChange(name, changes);
      gridRef.current.resetAfterIndices({ rowIndex, columnIndex }, false);

      /* Select the next cell */
      if (nextActiveCell) setActiveCell(nextActiveCell);
    }
  });
  const autoSizerProps = useSizer({
    gridRef,
    getValue,
    resizeStrategy: "full",
    rowCount,
    minColumnWidth: 100
  });
  const selectionArea = selections.reduce(
    (acc, { bounds }) => {
      for (let i = bounds.left; i <= bounds.right; i++) {
        acc.cols.push(i);
      }
      for (let i = bounds.top; i <= bounds.bottom; i++) {
        acc.rows.push(i);
      }
      return acc;
    },
    { rows: [], cols: [] }
  );
  const frozenColumns = 1;
  const frozenRows = 1;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        position: isActive ? "relative" : "absolute",
        top: isActive ? 0 : -2000
      }}
      ref={containerRef}
    >
      <Grid
        // snap
        showFillHandle={!isEditInProgress}
        activeCell={activeCell}
        width={width}
        height={height}
        ref={gridRef}
        selections={selections}
        columnCount={columnCount}
        rowCount={rowCount}
        rowHeight={() => 22}
        scrollThrottleTimeout={50}
        itemRenderer={props => {
          if (props.rowIndex < frozenRows) {
            return (
              <Header
                {...props}
                key={props.key}
                isActive={
                  (activeCell &&
                    activeCell.columnIndex === props.columnIndex) ||
                  selectionArea.cols.includes(props.columnIndex)
                }
              />
            );
          }
          if (props.columnIndex < frozenColumns) {
            return (
              <Header
                {...props}
                key={props.key}
                columnHeader
                isActive={
                  (activeCell && activeCell.rowIndex === props.rowIndex) ||
                  selectionArea.rows.includes(props.rowIndex)
                }
              />
            );
          }
          let value = data[[props.rowIndex, props.columnIndex]];
          const isFormula = value && value.toString().startsWith("=");
          if (isFormula) {
            value = parser.parse(value.substr(1)).result;
          }
          return (
            <Cell
              value={value}
              fill={isFormula ? "#ffc" : "white"}
              stroke="#ccc"
              {...props}
              key={props.key}
            />
          );
        }}
        frozenColumns={frozenColumns}
        frozenRows={frozenRows}
        {...selectionProps}
        {...editableProps}
        {...autoSizerProps}
        columnWidth={columnIndex => {
          if (columnIndex === 0) return 46;
          return autoSizerProps.columnWidth(columnIndex);
        }}
        onMouseDown={(...args) => {
          selectionProps.onMouseDown(...args);
          editableProps.onMouseDown(...args);
        }}
        onKeyDown={(...args) => {
          selectionProps.onKeyDown(...args);
          editableProps.onKeyDown(...args);
          undoProps.onKeyDown(...args);
        }}
      />
      {editorComponent}
    </div>
  );
};

const defaultSheets = [
  {
    name: "Sheet 1",
    cells: {
      "1,1": "Hello",
      "1,2": "World",
      "1,3": "=SUM(2,2)",
      "1,4": "=SUM(B2, 4)",
      "2,2": 10
    }
  }
];
const App = () => {
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheets, setSheets] = useState(defaultSheets);
  const handleChange = useCallback((name, changes) => {
    setSheets(prev => {
      return prev.map(cur => {
        if (cur.name === name) {
          return {
            ...cur,
            cells: {
              ...cur.cells,
              ...changes
            }
          };
        }
        return cur;
      });
    });
  }, []);
  return (
    <div className="Container">
      <div className="Container-Sheet">
        {sheets.map((sheet, i) => {
          return (
            <Sheet
              isActive={i === activeSheet}
              key={sheet.name}
              data={sheet.cells}
              name={sheet.name}
              onChange={handleChange}
            />
          );
        })}
      </div>
      <Tabs
        sheets={sheets}
        onAdd={() => {
          setSheets(prev =>
            prev.concat({ name: "Sheet" + (prev.length + 1), cells: {} })
          );
          setActiveSheet(sheets.length);
        }}
        active={activeSheet}
        onActive={setActiveSheet}
      />
    </div>
  );
};

const Tabs = ({ sheets, onAdd, active, onActive }) => {
  return (
    <div className="Tabs">
      <button className="Tabs-Button Tabs-Add" onClick={onAdd}>
        Add
      </button>
      {sheets.map((sheet, i) => {
        const className =
          "Tabs-Button " + (i === active ? "Tabs-Button-Active" : "");
        return (
          <button onClick={() => onActive(i)} key={i} className={className}>
            {sheet.name}
          </button>
        );
      })}
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
