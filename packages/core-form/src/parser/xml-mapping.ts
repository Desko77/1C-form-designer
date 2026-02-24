/**
 * Mapping between 1C XML format and FormModel kinds.
 */

/** xsi:type + <kind> → FormNode kind */
export const XML_TO_MODEL_KIND: Record<string, Record<string, string>> = {
  FormGroup: {
    UsualGroup: 'usualGroup',
    Pages: 'pages',
    Page: 'page',
    ColumnGroup: 'columnGroup',
    CommandBar: 'commandBar',
    AutoCommandBar: 'autoCommandBar',
  },
  FormField: {
    InputField: 'field',
    CheckBoxField: 'field',
    LabelField: 'field',
    RadioButtonField: 'field',
    TextBoxField: 'field',
    NumberField: 'field',
    DateField: 'field',
    TumblerField: 'field',
    SpinnerField: 'field',
    PictureField: 'field',
    TrackBarField: 'field',
    ProgressBarField: 'field',
    HTMLDocumentField: 'field',
    CalendarField: 'field',
    ChartField: 'field',
    FormattedDocumentField: 'field',
    PlannerField: 'field',
    PeriodField: 'field',
    TextDocumentField: 'field',
    SpreadSheetDocumentField: 'field',
    GraphicalSchemaField: 'field',
    GeographicalSchemaField: 'field',
    DendrogramField: 'field',
  },
  FormDecoration: {
    Label: 'decoration',
    Picture: 'decoration',
  },
  FormButton: { '*': 'button' },
  FormTable: { '*': 'table' },
};

/** XML <kind> value → FieldType */
export const XML_KIND_TO_FIELD_TYPE: Record<string, string> = {
  InputField: 'input',
  CheckBoxField: 'checkbox',
  LabelField: 'labelField',
  RadioButtonField: 'radioButton',
  TextBoxField: 'textBox',
  NumberField: 'number',
  DateField: 'date',
  TumblerField: 'tumbler',
  SpinnerField: 'spinner',
  PictureField: 'pictureField',
  TrackBarField: 'trackBar',
  ProgressBarField: 'progressBar',
  HTMLDocumentField: 'htmlField',
  CalendarField: 'calendarField',
  ChartField: 'chartField',
  FormattedDocumentField: 'formattedDocField',
  PlannerField: 'plannerField',
  PeriodField: 'periodField',
  TextDocumentField: 'textDocField',
  SpreadSheetDocumentField: 'spreadsheetDocField',
  GraphicalSchemaField: 'graphicalSchemaField',
  GeographicalSchemaField: 'geoSchemaField',
  DendrogramField: 'dendrogramField',
};

/** XML <kind> value for decoration */
export const XML_KIND_TO_DECORATION_TYPE: Record<string, 'label' | 'picture'> = {
  Label: 'label',
  Picture: 'picture',
};

/** FormNode kind → { xsiType, xmlKind? } */
export const MODEL_TO_XML_KIND: Record<string, { xsiType: string; xmlKind?: string }> = {
  usualGroup: { xsiType: 'FormGroup', xmlKind: 'UsualGroup' },
  pages: { xsiType: 'FormGroup', xmlKind: 'Pages' },
  page: { xsiType: 'FormGroup', xmlKind: 'Page' },
  columnGroup: { xsiType: 'FormGroup', xmlKind: 'ColumnGroup' },
  commandBar: { xsiType: 'FormGroup', xmlKind: 'CommandBar' },
  autoCommandBar: { xsiType: 'FormGroup', xmlKind: 'AutoCommandBar' },
  field: { xsiType: 'FormField' },
  decoration: { xsiType: 'FormDecoration' },
  button: { xsiType: 'FormButton' },
  table: { xsiType: 'FormTable' },
};

/** FieldType → XML <kind> value */
export const FIELD_TYPE_TO_XML_KIND: Record<string, string> = {
  input: 'InputField',
  checkbox: 'CheckBoxField',
  labelField: 'LabelField',
  radioButton: 'RadioButtonField',
  textBox: 'TextBoxField',
  number: 'NumberField',
  date: 'DateField',
  tumbler: 'TumblerField',
  spinner: 'SpinnerField',
  pictureField: 'PictureField',
  trackBar: 'TrackBarField',
  progressBar: 'ProgressBarField',
  htmlField: 'HTMLDocumentField',
  calendarField: 'CalendarField',
  chartField: 'ChartField',
  formattedDocField: 'FormattedDocumentField',
  plannerField: 'PlannerField',
  periodField: 'PeriodField',
  textDocField: 'TextDocumentField',
  spreadsheetDocField: 'SpreadSheetDocumentField',
  graphicalSchemaField: 'GraphicalSchemaField',
  geoSchemaField: 'GeographicalSchemaField',
  dendrogramField: 'DendrogramField',
};

/** Decoration type → XML <kind> value */
export const DECORATION_TYPE_TO_XML_KIND: Record<string, string> = {
  label: 'Label',
  picture: 'Picture',
};

/** GroupType model value → XML value */
export const GROUP_TYPE_TO_XML: Record<string, string> = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  horizontalIfPossible: 'HorizontalIfPossible',
  alwaysHorizontal: 'AlwaysHorizontal',
  columnsLikeInList: 'ColumnsLikeInList',
  indentedColumnsLikeInList: 'IndentedColumnsLikeInList',
};

/** XML GroupType value → model value */
export const XML_TO_GROUP_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(GROUP_TYPE_TO_XML).map(([k, v]) => [v, k]),
);

/** Known XML namespaces */
export const KNOWN_NAMESPACES: Record<string, string> = {
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  core: 'http://g5.1c.ru/v8/dt/mcore',
  mdclass: 'http://g5.1c.ru/v8/dt/metadata/mdclass',
  form: 'http://g5.1c.ru/v8/dt/form',
};
