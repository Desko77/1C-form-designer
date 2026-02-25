/**
 * Auto-naming for new form elements.
 * Generates names in 1C style: Группа1, Поле2, etc.
 */

import type { FormModel, FormNode, FormRoot } from '../model/form-model';
import { walkFormTree } from '../model/node-utils';

/** Name templates for each element kind */
const NAME_TEMPLATES: Record<string, string> = {
  usualGroup: 'Группа',
  pages: 'Страницы',
  page: 'Страница',
  columnGroup: 'ГруппаКолонок',
  commandBar: 'КоманднаяПанель',
  autoCommandBar: 'АвтоКоманднаяПанель',
  'field:input': 'Поле',
  'field:checkbox': 'Флажок',
  'field:labelField': 'ПолеНадписи',
  'field:radioButton': 'ПереключательПоля',
  'field:textBox': 'ТекстовоеПоле',
  'field:number': 'ПолеЧисла',
  'field:date': 'ПолеДаты',
  'field:tumbler': 'Тумблер',
  'field:spinner': 'Счетчик',
  'field:pictureField': 'ПолеКартинки',
  'decoration:label': 'Декорация',
  'decoration:picture': 'ДекорацияКартинка',
  button: 'Кнопка',
  table: 'Таблица',
};

/**
 * Generate a unique name for a new element.
 * Returns a name like "Группа1", "Поле3", etc.
 */
export function generateElementName(
  model: FormModel,
  kind: string,
  subType?: string,
): string {
  const templateKey = subType ? `${kind}:${subType}` : kind;
  const template = NAME_TEMPLATES[templateKey] || NAME_TEMPLATES[kind] || 'Элемент';

  // Collect all existing names
  const existingNames = collectAllNames(model.form);

  // Find the next available number
  let n = 1;
  while (existingNames.has(`${template}${n}`)) {
    n++;
  }

  return `${template}${n}`;
}

/**
 * Generate a unique name for a table column.
 */
export function generateColumnName(
  existingColumnNames: string[],
  baseTableName: string,
): string {
  const existing = new Set(existingColumnNames);
  let n = 1;
  while (existing.has(`${baseTableName}Колонка${n}`)) {
    n++;
  }
  return `${baseTableName}Колонка${n}`;
}

/** Collect all names from the form tree */
function collectAllNames(root: FormRoot): Set<string> {
  const names = new Set<string>();
  names.add(root.name);

  walkFormTree(root, (node) => {
    names.add(node.name);
  });

  return names;
}
