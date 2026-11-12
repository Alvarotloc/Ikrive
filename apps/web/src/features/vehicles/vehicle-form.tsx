import { zodResolver } from '@hookform/resolvers/zod';
import { FUEL_TYPES, VEHICLE_TYPES, type Vehicle } from '@ikrive/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/lib/format';
import { parseDecimal, parseInteger } from './numbers';

const numeric = (parse: (text: string) => number | null, schema: z.ZodNumber) =>
  z.string().transform(parse).pipe(schema.nullable());

const formSchema = z.object({
  name: z.string().trim().max(60),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  version: z.string().trim().max(80),
  year: numeric(parseInteger, z.number().int().min(1886).max(2100)),
  plate: z.string().trim().max(20),
  vin: z.string().trim().max(17),
  type: z.enum(VEHICLE_TYPES),
  fuelType: z.enum(FUEL_TYPES),
  purchaseDate: z.union([z.literal(''), z.iso.date()]).transform((value) => value || null),
  purchasePrice: numeric(parseDecimal, z.number().min(0)),
  purchaseOdometer: numeric(parseInteger, z.number().int().min(0).max(9_999_999)),
  currentOdometer: numeric(parseInteger, z.number().int().min(0).max(9_999_999)),
  notes: z.string().trim().max(2000),
});

type FormInput = z.input<typeof formSchema>;
export type VehicleFormValues = z.output<typeof formSchema>;

const toText = (value: number | string | null | undefined) => (value == null ? '' : String(value));

function defaultsFrom(vehicle?: Vehicle): FormInput {
  return {
    name: toText(vehicle?.name),
    make: toText(vehicle?.make),
    model: toText(vehicle?.model),
    version: toText(vehicle?.version),
    year: toText(vehicle?.year),
    plate: toText(vehicle?.plate),
    vin: toText(vehicle?.vin),
    type: vehicle?.type ?? 'car',
    fuelType: vehicle?.fuelType ?? 'gasoline',
    purchaseDate: toText(vehicle?.purchaseDate),
    purchasePrice: toText(vehicle?.purchasePrice),
    purchaseOdometer: toText(vehicle?.purchaseOdometer),
    currentOdometer: '',
    notes: toText(vehicle?.notes),
  };
}

interface VehicleFormProps {
  /** Vehicle being edited; omit to create a new one. */
  vehicle?: Vehicle;
  /** Saves the vehicle; if it rejects, the form shows a generic error toast and stays as it is. */
  onSubmit: (values: VehicleFormValues) => Promise<unknown>;
  onCancel: () => void;
}

export function VehicleForm({ vehicle, onSubmit, onCancel }: VehicleFormProps) {
  const { t } = useTranslation();
  const { distanceUnit } = useFormat();
  const form = useForm<FormInput, unknown, VehicleFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFrom(vehicle),
  });
  const { errors, isSubmitting } = form.formState;
  // A failed save (no connection, a storage error on the phone…) must not be lost in an unhandled rejection.
  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch {
      toast.error(t('common.error'));
    }
  });
  const field = (name: keyof FormInput) => ({
    id: name,
    label: t(`vehicles.fields.${name}`, { unit: distanceUnit }),
    error: errors[name]?.message,
  });

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>{t('vehicles.form.identity')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField {...field('make')}>
            <Input id="make" autoComplete="off" placeholder="Seat" {...form.register('make')} />
          </FormField>
          <FormField {...field('model')}>
            <Input id="model" autoComplete="off" placeholder="León" {...form.register('model')} />
          </FormField>
          <FormField {...field('version')}>
            <Input id="version" autoComplete="off" placeholder="FR 1.5 TSI" {...form.register('version')} />
          </FormField>
          <FormField {...field('year')}>
            <Input id="year" inputMode="numeric" placeholder="2019" {...form.register('year')} />
          </FormField>
          <FormField {...field('type')}>
            <Select id="type" {...form.register('type')}>
              {VEHICLE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`vehicles.types.${type}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField {...field('fuelType')}>
            <Select id="fuelType" {...form.register('fuelType')}>
              {FUEL_TYPES.map((fuel) => (
                <option key={fuel} value={fuel}>
                  {t(`vehicles.fuels.${fuel}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField {...field('name')}>
              <Input
                id="name"
                autoComplete="off"
                placeholder={t('vehicles.form.namePlaceholder')}
                {...form.register('name')}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vehicles.form.registration')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField {...field('plate')}>
            <Input id="plate" autoComplete="off" className="uppercase" {...form.register('plate')} />
          </FormField>
          <FormField {...field('vin')}>
            <Input
              id="vin"
              autoComplete="off"
              maxLength={17}
              className="uppercase"
              {...form.register('vin')}
            />
          </FormField>
          {!vehicle && (
            <div className="sm:col-span-2">
              <FormField {...field('currentOdometer')}>
                <Input
                  id="currentOdometer"
                  inputMode="numeric"
                  placeholder="132.480"
                  {...form.register('currentOdometer')}
                />
              </FormField>
              <p className="mt-2 text-sm text-muted-foreground">{t('vehicles.form.currentOdometerHint')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('vehicles.form.purchase')}</CardTitle>
          <CardDescription>{t('vehicles.form.purchaseDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <FormField {...field('purchaseDate')}>
            <Input id="purchaseDate" type="date" {...form.register('purchaseDate')} />
          </FormField>
          <FormField {...field('purchasePrice')}>
            <Input id="purchasePrice" inputMode="decimal" {...form.register('purchasePrice')} />
          </FormField>
          <FormField {...field('purchaseOdometer')}>
            <Input id="purchaseOdometer" inputMode="numeric" {...form.register('purchaseOdometer')} />
          </FormField>
          <div className="sm:col-span-3">
            <FormField {...field('notes')}>
              <Textarea id="notes" {...form.register('notes')} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {vehicle ? t('common.save') : t('vehicles.add')}
        </Button>
      </div>
    </form>
  );
}
