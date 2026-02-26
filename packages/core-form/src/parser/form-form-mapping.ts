/**
 * Mapping between Form.form (EDT) xsi:type + <type> and FormModel kinds.
 *
 * Form.form uses `form:` prefix on xsi:type values and <type> instead of <kind>.
 */

/** xsi:type (with form: prefix) + <type> value → FormNode kind */
export const FORM_FORM_TO_MODEL_KIND: Record<string, Record<string, string>> = {
  'form:FormGroup': {
    UsualGroup: 'usualGroup',
    Pages: 'pages',
    Page: 'page',
    ColumnGroup: 'columnGroup',
    CommandBar: 'commandBar',
    AutoCommandBar: 'autoCommandBar',
  },
  'form:FormField': {
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
  'form:FormDecoration': {
    Label: 'decoration',
    Picture: 'decoration',
  },
  'form:Button': { '*': 'button' },
  'form:FormButton': { '*': 'button' },
  'form:Table': { '*': 'table' },
  'form:FormTable': { '*': 'table' },
};

/** FormNode kind → Form.form xsi:type + type value */
export const MODEL_TO_FORM_FORM_KIND: Record<string, { xsiType: string; type?: string }> = {
  usualGroup: { xsiType: 'form:FormGroup', type: 'UsualGroup' },
  pages: { xsiType: 'form:FormGroup', type: 'Pages' },
  page: { xsiType: 'form:FormGroup', type: 'Page' },
  columnGroup: { xsiType: 'form:FormGroup', type: 'ColumnGroup' },
  commandBar: { xsiType: 'form:FormGroup', type: 'CommandBar' },
  autoCommandBar: { xsiType: 'form:FormGroup', type: 'AutoCommandBar' },
  field: { xsiType: 'form:FormField' },
  decoration: { xsiType: 'form:FormDecoration' },
  button: { xsiType: 'form:FormButton' },
  table: { xsiType: 'form:FormTable' },
};
